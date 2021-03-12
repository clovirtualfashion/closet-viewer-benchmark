import * as D from "io-ts/Decoder";

export const D_SRest = D.type({
    dracos: D.array(D.string),
    images: D.array(D.string),
    rest: D.array(D.string)
});
export type SRest = D.TypeOf<typeof D_SRest>;
