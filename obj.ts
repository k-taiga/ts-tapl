import { parseObj } from "npm:tiny-ts-parser";

// 項の型を表す
type Term =
  | { tag: "true" }
  | { tag: "false" }
  | { tag: "if"; cond: Term; thn: Term; els: Term }
  | { tag: "number"; n: number }
  | { tag: "add"; left: Term; right: Term }
  | { tag: "var"; name: string }
  // 複数の引数を[]で定義
  | { tag: "func"; params: Param[]; body: Term }
  | { tag: "call"; func: Term; args: Term[] }
  | { tag: "seq"; body: Term; rest: Term }
  | { tag: "const"; name: string; init: Term; rest: Term }
  // object生成
  | { tag: "objectNew"; props: PropertyTerm[] }
  // objectからのプロパティの読み出し
  | { tag: "objectGet"; obj: Term; propName: string };

type Type =
  | { tag: "Boolean" }
  | { tag: "Number" }
  // 関数の型を表す 引数と戻り値の型を定義
  | { tag: "Func"; params: Param[]; retType: Type }
  | { tag: "Object"; props: PropertyType[] };

type Param = { name: string; type: Type };

// 変数の型を表す Record 型を使用
type TypeEnv = Record<string, Type>;

// プロパティの型を構文木
type PropertyTerm = { name: string; term: Term };

// プロパティの型を表す
type PropertyType = { name: string; type: Type };

// error関数
function error(message: string, term?: Term): never {
  if (term) {
    throw new Error(`${message} at ${JSON.stringify(term)}`);
  } else {
    throw new Error(message);
  }
}

// 実引数と仮引数の型を比較する関数
// 実際に実行する関数の型とその関数を呼び出すときに渡す引数の型が一致するかどうかを確認するため
// ty1 と ty2 が同じ型かどうかを比較する
function typeEq(ty1: Type, ty2: Type): boolean {
  switch (ty2.tag) {
    case "Boolean":
      return ty1.tag === "Boolean";
    case "Number":
      return ty1.tag === "Number";
    // 関数型の比較
    case "Func": {
      if (ty1.tag !== "Func") return false;
      // 引数の数を比較
      if (ty1.params.length !== ty2.params.length) return false;
      for (let i = 0; i < ty1.params.length; i++) {
        // 再帰的に比較
        if (!typeEq(ty1.params[i].type, ty2.params[i].type)) {
          return false;
        }
      }
      // 戻り値の型を比較
      if (!typeEq(ty1.retType, ty2.retType)) return false;
      return true;
    }
    case "Object": {
      // ty1 が Object 型であることを確認
      if (ty1.tag !== "Object") return false;
      // プロパティの数を比較
      if (ty1.props.length !== ty2.props.length) return false;
      for (const prop2 of ty2.props) {
        // ty1のプロパティの中にprop2と同じ名前のものがあるか
        const prop1 = ty1.props.find((prop1) => prop1.name === prop2.name);
        if (!prop1) return false; // プロパティが見つからない場合は false
        // プロパティの型を比較
        // prop1とprop2の型が一致するかどうかを再帰的に確認
        if (!typeEq(prop1.type, prop2.type)) {
          return false;
        }
      }
      return true;
    }
  }
}

// typecheck 関数は、項 t の型を tyEnv 型環境に基づいてチェックする
function typecheck(t: Term, tyEnv: TypeEnv): Type {
  switch (t.tag) {
    case "true":
      return { tag: "Boolean" };
    case "false":
      return { tag: "Boolean" };
    case "if": {
      const condTy = typecheck(t.cond, tyEnv);
      if (condTy.tag !== "Boolean") error("boolean expected", t.cond);
      const thnTy = typecheck(t.thn, tyEnv);
      const elsTy = typecheck(t.els, tyEnv);
      // then と else の型が異なる場合はエラー
      if (!typeEq(thnTy, elsTy)) {
        error("then and else must have the same type", t);
      }
      return thnTy; // thnTy と elsTy は同じ型なのでどちらかを返す
    }
    case "number":
      return { tag: "Number" };
    case "add": {
      // 再帰的に typecheck
      const leftTy = typecheck(t.left, tyEnv);
      // Number 型でない場合はエラー
      if (leftTy.tag !== "Number") error("number expected", t.left);
      const rightTy = typecheck(t.right, tyEnv);
      if (rightTy.tag !== "Number") error("number expected", t.right);
      return { tag: "Number" };
    }
    case "var": {
      // varはnameを持っているのでnameがないということは未定義変数となるためエラーにする
      if (tyEnv[t.name] === undefined)
        error(`unknown variable: ${t.name}`, t);
      return tyEnv[t.name];
    }
    case "func": {
      // 関数の型をコピーして新しい型を作成
      const newTyEnv = { ...tyEnv };
      // 型に引数の型を追加
      for (const { name, type } of t.params) {
        newTyEnv[name] = type;
      }
      // 関数の中身と引数の型をチェックする
      const retType = typecheck(t.body, newTyEnv);
      return { tag: "Func", params: t.params, retType };
    }
    case "call": {
      // t.func は関数呼び出しの対象で、t.args は実引数のリスト
      // 再帰的に func の型をチェック
      const funcTy = typecheck(t.func, tyEnv);
      // 呼び出す関数の型が Func であることを確認
      if (funcTy.tag !== "Func") error("function type expected", t);
      // 引数の型が関数の引数の型と一致することを確認
      if (funcTy.params.length !== t.args.length) {
        error("wrong number of arguments", t);
      }
      // 各引数の型をチェック
      for (let i = 0; i < t.args.length; i++) {
        const argTy = typecheck(t.args[i], tyEnv);
        if (!typeEq(argTy, funcTy.params[i].type)) {
          error("parameter type mismatch", t);
        }
      }
      return funcTy.retType; // 関数の戻り値の型を返す
    }
    case "seq": {
      // seq は複数の式を順に再帰的に評価する
      // bodyの返り値は特に不要
      typecheck(t.body, tyEnv);
      return typecheck(t.rest, tyEnv);
    }
    case "const": {
      const ty = typecheck(t.init, tyEnv);
      // const newTyEnv = { ...tyEnv , [t.name]: ty};を以下に分解
      const newTyEnv = { ...tyEnv };
      newTyEnv[t.name] = ty; // 新しい変数を型環境に追加
      return typecheck(t.rest, newTyEnv);
    }
    // object生成したものの型をチェック
    case "objectNew": {
      const props = t.props.map(
        // mapでname,valueのみを分割代入し({name:prop.name, type:typecheck(prop.term,tyEnv)})を作成
        ({ name, term }) => ({ name, type: typecheck(term, tyEnv) })
      );
      return { tag: "Object", props };
    }
    // objectからプロパティを取得する際の型チェック
    case "objectGet": {
      const objectTy = typecheck(t.obj, tyEnv);
      if (objectTy.tag !== "Object") error("object type expected", t);
      const prop = objectTy.props.find((prop) => prop.name === t.propName);
      if (!prop) error(`unknown property: ${t.propName}`, t);
      return prop.type;
    }
    default:
      error("not implemented yet", t);
  }
}

console.log(
  typecheck(
    parseObj(`
    const x = { foo: 1, bar: true };
    x.foo;`),
    {}
  )
);