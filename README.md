# Usage

```
npm i zrest-benchmarker
```

See `src/index.spec.ts` for a complete example.

```typescript
benchmark(new URL(sampleLib), sampleZrests.map(x=>new URL(x))).then(result => {
    console.log(result);
})
```