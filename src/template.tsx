import React from "react";
import U from "url";
import {SRest} from "./types";
export const hookDomain = "http://screenshotrequest.clo";
export const timestampLabel = "closet viewer benchmark";

export const template = (libURL: U.URL, modelURLs: readonly U.URL[]) => (
  <div>
    <div
    id="target"
    style={{
        width: 512,
        height: 512,
    }}
    />
    <script type="text/javascript" src={libURL.toString()}/>
    <script
    dangerouslySetInnerHTML={{
        __html: `
    closet.viewer.init({
        element: 'target',
        width: 512,
        height: 512,
        stats: true
    });
      
      
      function recursion(urls) {
          if (urls.length == 0) {
              fetch("${hookDomain}", {method: 'DELETE',})
          } else {
              closet.viewer.loadZrestUrl(urls[0], function(x){}, function(x){
                  fetch("${hookDomain}", { method: "POST", body: "${measureCue}"});
                  recursion(urls.slice(1))
              })
          }
      }
      
      recursion([
      ${modelURLs.map(x => `"` + x.toString() + `"`).join(", ")}
      ])
    `,
    }}
    />
  </div>
);

export const templateForFPS = (libURL: U.URL, modelURL: U.URL, secInMS:number, viewWidth:number, viewHeight:number) => (
  <div>
    <div
    id="target"
    style={{width: 512, height: 512}}
    />
    <script type="text/javascript" src={libURL.toString()}/>
    <script
    dangerouslySetInnerHTML={{
        __html: `
    closet.viewer.init({
        element: 'target',
        width: 512,
        height: 512,
        stats: true
    });
    closet.viewer.loadZrestUrl(${'"' + modelURL.toString() + '"'}, function(x){}, function(x){
     closet.viewer.countFPSTurning(${secInMS}, ${viewWidth}, ${viewHeight}).then(fps=>{
        fetch("http://screenshotrequest.clo", {method: 'PUT', body: JSON.stringify({fps})})
      })
    })
    `,
    }}
    />
  </div>
);

export const measureCue = "measure cue"

function makeRecursiveTemplateJSCode(srests: readonly SRest[]): string {
    if (srests.length === 0) {
        return `fetch("${hookDomain}", { method: "DELETE", });`
    } else {
        return `
        console.log("SREST BENCHMARKICB START!!", ${srests.length})
        closet.viewer.loadSeparatedZRest(${JSON.stringify(srests[0])}, (x)=>{}, 0, ()=>{
          fetch("${hookDomain}", { method: "POST", body: "${measureCue}"});
          console.timeStamp("${timestampLabel}")
          ${makeRecursiveTemplateJSCode(srests.slice(1))}
        })`
    }
}

function makeTemplateJSCode(libURL: U.URL, srests: readonly SRest[]): string {
    const initCode = `closet.viewer.init({
  element: "target",
  width: 512,
  height: 512,
  stats: true,
});`;
    return initCode + makeRecursiveTemplateJSCode(srests);
}

export const templateSrest = (libURL: U.URL, srests: readonly SRest[]) => (
    <div>
        <div id="target" style={{width: 512, height: 512}}/>
        <script type='text/javascript' src={libURL.toString()}/>
        <script dangerouslySetInnerHTML={{__html: makeTemplateJSCode(libURL, srests)}}>
        </script>
    </div>
);

export const zrestTraceTemplate = (libURL: U.URL, zrestURL: U.URL) => (
    <div>
        <div
            id="target"
            style={{
                width: 512,
                height: 512,
            }}
        />
        <script type="text/javascript" src={libURL.toString()}/>
        <script
            dangerouslySetInnerHTML={{
                __html: `
    closet.viewer.init({
        element: 'target',
        width: 512,
        height: 512,
        stats: true
    });
      closet.viewer.loadZrestUrl("${zrestURL.toString()}", function(x){}, function(x){
                  fetch("${hookDomain}", {method: 'PUT',})
    })
    `,
            }}
        />
    </div>
);