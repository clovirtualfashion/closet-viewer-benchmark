import * as D from "io-ts/Decoder";
import * as E from "fp-ts/Either";
import * as R from "fp-ts/Record";

import { pipe } from "fp-ts/lib/function";

export type DynamoN = { N: string };
export type DynamoS = { S: string };
export type DynamoM = { M: { [property: string]: DynamoAttribute } };
export type DynamoAttribute = DynamoM | DynamoN | DynamoS;

export function encodeDynamoFormat(raw: any): E.Either<string, DynamoAttribute> {
  const tryNumber = D.number.decode(raw);
  if(E.isRight(tryNumber)) {
    return E.right({N: tryNumber.right.toString()});
  }
  const tryString = D.string.decode(raw);
  if(E.isRight(tryString)) {
    return E.right({S:tryString.right});
  }
  const tryMap = D.UnknownRecord.decode(raw);
  if(E.isRight(tryMap)) {
    return pipe(tryMap.right, R.map(encodeDynamoFormat), R.sequence(E.either), E.map(m=>({M:m})))
  }
  return E.left(`unable to encode ${raw}`);
}