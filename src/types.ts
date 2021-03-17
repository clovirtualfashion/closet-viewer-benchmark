import * as D from "io-ts/Decoder";
import {getStructMonoid, Monoid, monoidSum} from "fp-ts/Monoid";

export const D_SRest = D.type({
    dracos: D.array(D.string),
    images: D.array(D.string),
    rest: D.array(D.string)
});
export type SRest = D.TypeOf<typeof D_SRest>;


export const metricSumMonoid = getStructMonoid({
    Timestamp: monoidSum,
    /** Number of documents in the page. */
    Documents: monoidSum,
    /** Number of events in the page. */
    JSEventListeners: monoidSum,
    /** Number of DOM nodes in the page. */
    Nodes: monoidSum,
    /** Total monoidSum of full or partial page layout. */
    LayoutCount: monoidSum,
    /** Total monoidSum of page style recalculations. */
    RecalcStyleCount: monoidSum,
    /** Combined durations of all page layouts. */
    LayoutDuration: monoidSum,
    /** Combined duration of all page style recalculations. */
    RecalcStyleDuration: monoidSum,
    /** Combined duration of JavaScript execution. */
    ScriptDuration: monoidSum,
    /** Combined duration of all tasks performed by the browser. */
    TaskDuration: monoidSum,
    /** Used JavaScript heap size. */
    JSHeapUsedSize: monoidSum,
    /** Total JavaScript heap size. */
    JSHeapTotalSize: monoidSum,
})
export const monoidMax: Monoid<number> = {
    concat: Math.max,
    empty: 0
}
export const monoidMin: Monoid<number> = {
    concat: Math.min,
    empty: Number.MAX_VALUE
}
export const metricMaxMonoid = getStructMonoid({
    Timestamp: monoidMax,
    /** Number of documents in the page. */
    Documents: monoidMax,
    /** Number of frames in the page. */
    JSEventListeners: monoidMax,
    /** Number of DOM nodes in the page. */
    Nodes: monoidMax,
    /** Total monoidMax of full or partial page layout. */
    LayoutCount: monoidMax,
    /** Total monoidMax of page style recalculations. */
    RecalcStyleCount: monoidMax,
    /** Combined durations of all page layouts. */
    LayoutDuration: monoidMax,
    /** Combined duration of all page style recalculations. */
    RecalcStyleDuration: monoidMax,
    /** Combined duration of JavaScript execution. */
    ScriptDuration: monoidMax,
    /** Combined duration of all tasks performed by the browser. */
    TaskDuration: monoidMax,
    /** Used JavaScript heap size. */
    JSHeapUsedSize: monoidMax,
    /** Total JavaScript heap size. */
    JSHeapTotalSize: monoidMax,
})