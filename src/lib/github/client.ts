export type Unavailable = {
  available: false;
  reason: string;
  hint?: string;
};

export type Available<T> = { available: true; data: T };
export type Maybe<T> = Available<T> | Unavailable;
