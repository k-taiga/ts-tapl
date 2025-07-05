import { parseArith } from "npm:tiny-ts-parser";

type Type = { tag: "Boolean" } | { tag: "Number" };

// 項の型を表す Type を定義
type Term =
  | { tag: "true" }
  | { tag: "false" }
  | { tag: "if"; cond: Term; thn: Term; els: Term }
  | { tag: "number"; n: number }
  | { tag: "add"; left: Term; right: Term };

function typecheck(t: Term): Type {
	switch(t.tag) {
		case "true":
			return { tag: "Boolean" };
		case "false":
			return { tag: "Boolean" };
		case "if": {
			// if 文の型チェック
			const condTy = typecheck(t.cond);
			if(condTy. tag !== "Boolean") throw "boolean expected";
			// then と else の型チェック
			const thnTy = typecheck(t.thn);
			const elsTy = typecheck(t.els);
			// then と else の型が異なる場合はエラー
			if(thnTy.tag !== elsTy.tag) {
				throw "then and else have different types";
			}
			return thnTy; // thnTy と elsTy は同じ型なのでどちらかを返す
		}
		case "number":
			return { tag: "Number" };
		case "add": {
			// 再帰的に typecheck
			const leftTy = typecheck(t.left);
			// Number 型でない場合はエラー
			if(leftTy.tag !== "Number") throw "number expected";
			const rightTy = typecheck(t.right);
			if(rightTy.tag !== "Number") throw "number expected";
			return { tag: "Number" };
		}
	}
}

console.log(typecheck(parseArith("1 + 2"))); // { tag: 'Number' }
console.log(typecheck(parseArith("1 + true"))); // Error: number expected