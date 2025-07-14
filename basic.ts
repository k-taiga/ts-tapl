import { parseBasic } from "npm:tiny-ts-parser";

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
  | { tag: "seq2"; body: Term[] }
  | { tag: "const2"; name: string; init: Term };

type Type =
  | { tag: "Boolean" }
  | { tag: "Number" }
  // 関数の型を表す 引数と戻り値の型を定義
  | { tag: "Func"; params: Param[]; retType: Type };

type Param = { name: string; type: Type };

// 変数の型を表す Record 型を使用
type TypeEnv = Record<string, Type>;

// 実引数と仮引数の型を比較する関数
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
  }
}

function typecheck(t: Term, tyEnv: TypeEnv): Type {
  switch (t.tag) {
    case "true":
      return { tag: "Boolean" };
    case "false":
      return { tag: "Boolean" };
    case "if": {
      const condTy = typecheck(t.cond, tyEnv);
      if (condTy.tag !== "Boolean") throw "boolean expected";
      const thnTy = typecheck(t.thn, tyEnv);
      const elsTy = typecheck(t.els, tyEnv);
      // then と else の型が異なる場合はエラー
      if (!typeEq(thnTy, elsTy)) {
        throw "then and else must have the same type";
      }
      return thnTy; // thnTy と elsTy は同じ型なのでどちらかを返す
    }
    case "number":
      return { tag: "Number" };
    case "add": {
      // 再帰的に typecheck
      const leftTy = typecheck(t.left, tyEnv);
      // Number 型でない場合はエラー
      if (leftTy.tag !== "Number") throw "number expected";
      const rightTy = typecheck(t.right, tyEnv);
      if (rightTy.tag !== "Number") throw "number expected";
      return { tag: "Number" };
    }
    case "var": {
      // varはnameを持っているのでnameがないということは未定義変数となるためエラーにする
      if (tyEnv[t.name] === undefined)
        throw new Error(`unknown variable: ${t.name}`);
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
      if (funcTy.tag !== "Func") throw new Error("function type expected");
      // 引数の型が関数の引数の型と一致することを確認
      if (funcTy.params.length !== t.args.length) {
        throw new Error("wrong number of arguments");
      }
      // 各引数の型をチェック
      for (let i = 0; i < t.args.length; i++) {
        const argTy = typecheck(t.args[i], tyEnv);
        if (!typeEq(argTy, funcTy.params[i].type)) {
          throw new Error("parameter type mismatch");
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
    case "seq2": {
      let lastTy: Type | null = null;
      // t.bodyが配列なのですべて検査
      for (const term of t.body) {
        if (term.tag === "const2") {
          // const2の場合、初期値をチェック
          const ty = typecheck(term.init, tyEnv);
          // 下の変数をコピーしtyのものを追加
          tyEnv = { ...tyEnv, [term.name]: ty };
        } else {
          lastTy = typecheck(term, tyEnv);
        }
      }
      return lastTy!;
    }
    case "const": {
      const ty = typecheck(t.init, tyEnv);
      // const newTyEnv = { ...tyEnv , [t.name]: ty};を以下に分解
      const newTyEnv = { ...tyEnv };
      newTyEnv[t.name] = ty; // 新しい変数を型環境に追加
      return typecheck(t.rest, newTyEnv);
    }
    default:
      throw new Error("not implemented yet");
  }
}

console.log(typecheck(parseBasic("(x: boolean) => 42"), {}));
console.log(typecheck(parseBasic("(x: number) => x"), {}));
console.log(typecheck(parseBasic("( (x: number) => x )(42)"), {}));

console.log(
  typecheck(
    parseBasic(`
    const add = (x: number, y: number) => x + y;
    const select = (b: boolean, x: number, y: number) => b? x : y;
    const x = add(1, add(2, 3));
    const y = select (true, x, x);

    y;`), // number型
    {}
  )
);
