interface Pair<T, V> {
  left: T;
  right: V;
}

export function zip<T, V>(xs: ArrayLike<T>, ys: ArrayLike<V>): Pair<T, V>[] {
  const zipped = [];
  for (let i = 0; i < Math.max(xs.length, ys.length); i++) {
    let pair = {
      left: xs[i],
      right: ys[i]
    };
    zipped.push(pair);
  }
  return zipped;
}

export function getMethodNames(Class: any): string[] {
  return Object.getOwnPropertyNames(Class.prototype).filter(
    (x) => x !== "constructor"
  );
}

export function isObject(val: unknown): val is Object {
  return Object.prototype.toString.call(val) === "[object Object]";
}

export function isFunction(val: unknown): val is Function {
  return Object.prototype.toString.call(val) === "[object Function]";
}

export function isArray(val: unknown): val is Array<any> {
  return Array.isArray(val);
}
