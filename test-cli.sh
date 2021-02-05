#!/usr/bin/env bash

npx node dist/zrest-benchmarker.js \
  -l "https://viewer-library.s3.ap-northeast-2.amazonaws.com/f12364c4-01ed-4953-a139-723bef2b1526.js" \
  -a "https://e9mtlzmh19.execute-api.ap-northeast-2.amazonaws.com/develop" \
  -t ClosetViewerMetric \
  -z "https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/00000000.zrest" \
  -z "https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/00000001.zrest" \
  -z "https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/00000002.zrest" \
  --heavy-zrest "https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/heavy.zrest" \
  --fps-view-height 1000 \
  --fps-view-width 1000 \
  --fps-ms 10000 \
  -s 'https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/srests/8da914c6-fe27-4dbf-9e89-a6e3f42bb72b/010074390d0848e0bb75184e53efebfa/srest.json' \
  -s 'https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/srests/8da914c6-fe27-4dbf-9e89-a6e3f42bb72b/1d55ad72560142a486e6a97deebcbcbe/srest.json' \
  --tracing-zrest 'https://viewer-test-model.s3.ap-northeast-2.amazonaws.com/00000000.zrest' \
  --tracing-bucket 'viewer-tracings'