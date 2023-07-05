import { z } from "zod";
import {
  SzOptional,
  SzNullable,
  SzDefault,
  SzLiteral,
  SzArray,
  SzObject,
  SzUnion,
  SzDiscriminatedUnion,
  SzIntersection,
  SzTuple,
  SzRecord,
  SzMap,
  SzSet,
  SzFunction,
  SzEnum,
  SzPromise,
  SzPrimitive,
  SzNumber,
  SzDescription,
} from "./types";

export const PRIMITIVES = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBoolean: "boolean",
  ZodNaN: "nan",
  ZodBigInt: "bigInt",
  ZodDate: "date",
  ZodUndefined: "undefined",
  ZodNull: "null",
  ZodAny: "any",
  ZodUnknown: "unknown",
  ZodNever: "never",
  ZodVoid: "void",
} as const satisfies Readonly<
  Partial<
    Record<Exclude<z.ZodFirstPartyTypeKind, "ZodSymbol">, SzPrimitive["type"]>
  >
>;
export type PrimitiveMap = typeof PRIMITIVES;

// Zod Type helpers
type Schema = z.ZodFirstPartySchemaTypes;
type TypeName<T extends Schema> = T["_def"]["typeName"];

type IsZodPrimitive<T extends Schema> = TypeName<T> extends keyof PrimitiveMap
  ? any
  : never;

type ZerializeArray<Items extends Schema[]> = {
  [Index in keyof Items]: Zerialize<Items[Index]>;
};

// Types must match the exported zerialize function's implementation
export type Zerialize<T extends Schema> = Partial<SzDescription> &
  (T extends z.ZodOptional<infer I> // Modifier types
    ? Zerialize<I> & SzOptional
    : T extends z.ZodNullable<infer I>
    ? Zerialize<I> & SzNullable
    : T extends z.ZodDefault<infer I>
    ? Zerialize<I> & SzDefault<I["_type"]>
    : // Primitives
    T extends z.ZodNumber
    ? SzNumber
    : T extends IsZodPrimitive<T>
    ? {
        type: (typeof PRIMITIVES)[TypeName<T>];
      }
    : //
    T extends z.ZodLiteral<infer Value>
    ? SzLiteral<Value>
    : // List Collections
    T extends z.ZodTuple<infer Items>
    ? SzTuple<ZerializeArray<[...Items]>>
    : T extends z.ZodSet<infer T>
    ? SzSet<Zerialize<T>>
    : T extends z.ZodArray<infer T>
    ? SzArray<Zerialize<T>>
    : // Key/Value Collections
    T extends z.ZodObject<infer Properties>
    ? SzObject<{
        [Property in keyof Properties]: Zerialize<Properties[Property]>;
      }>
    : T extends z.ZodRecord<infer Key, infer Value>
    ? SzRecord<Zerialize<Key>, Zerialize<Value>>
    : T extends z.ZodMap<infer Key, infer Value>
    ? SzMap<Zerialize<Key>, Zerialize<Value>>
    : // Enums
    T extends z.ZodEnum<infer Values>
    ? SzEnum<Values>
    : T extends z.ZodNativeEnum<infer _Values>
    ? { type: "unknown" }
    : // Union/Intersection
    T extends z.ZodUnion<infer Options>
    ? SzUnion<ZerializeArray<[...Options]>>
    : T extends z.ZodDiscriminatedUnion<infer Discriminator, infer Options>
    ? SzDiscriminatedUnion<Discriminator, ZerializeArray<Options>>
    : T extends z.ZodIntersection<infer L, infer R>
    ? SzIntersection<Zerialize<L>, Zerialize<R>>
    : // Specials
    T extends z.ZodFunction<infer Args, infer Return>
    ? SzFunction<Zerialize<Args>, Zerialize<Return>>
    : T extends z.ZodPromise<infer Value>
    ? SzPromise<Zerialize<Value>>
    : // Unserializable types, fallback to serializing an inner type
    T extends z.ZodLazy<infer T>
    ? Zerialize<T>
    : T extends z.ZodEffects<infer T>
    ? Zerialize<T>
    : T extends z.ZodBranded<infer T, infer _Brand>
    ? Zerialize<T>
    : T extends z.ZodPipeline<infer _In, infer Out>
    ? Zerialize<Out>
    : T extends z.ZodCatch<infer Inner>
    ? Zerialize<Inner>
    : unknown);

type ZodTypeMap = {
  [Key in TypeName<Schema>]: Extract<Schema, { _def: { typeName: Key } }>;
};
type ZerializersMap = {
  [Key in TypeName<Schema>]: (
    def: ZodTypeMap[Key]["_def"]
  ) => Zerialize<ZodTypeMap[Key]>;
};

const STRING_KINDS = new Set([
  "email",
  "url",
  "emoji",
  "uuid",
  "cuid",
  "cuid2",
  "ulid",
]);

const zerializers = {
  ZodOptional: (def) => ({
    ...zerialize(def.innerType),
    isOptional: true,
    description: def.description,
  }),
  ZodNullable: (def) => ({
    ...zerialize(def.innerType),
    isNullable: true,
    description: def.description,
  }),
  ZodDefault: (def) => ({
    ...zerialize(def.innerType),
    defaultValue: def.defaultValue(),
    description: def.description,
  }),

  ZodNumber: (def) => {
    const checks = def.checks.reduce(
      (o, check) => ({
        ...o,
        ...(check.kind == "min"
          ? {
              min: check.value,
              ...(check.inclusive ? { minInclusive: true } : {}),
            }
          : check.kind == "max"
          ? {
              max: check.value,
              ...(check.inclusive ? { maxInclusive: true } : {}),
            }
          : check.kind == "multipleOf"
          ? { multipleOf: check.value }
          : check.kind == "int"
          ? { int: true }
          : check.kind == "finite"
          ? {
              finite: true,
              /* c8 ignore next 2 -- Guard */
            }
          : {}),
      }),
      {}
    );
    return { type: "number", description: def.description, ...checks };
  },
  ZodString: (def) => {
    const checks = def.checks.reduce(
      (o, check) => ({
        ...o,
        ...(check.kind == "min"
          ? { min: check.value }
          : check.kind == "max"
          ? { max: check.value }
          : check.kind == "length"
          ? { length: check.value }
          : check.kind == "startsWith"
          ? { startsWith: check.value }
          : check.kind == "endsWith"
          ? { endsWith: check.value }
          : check.kind == "includes"
          ? { includes: check.value, position: check.position }
          : check.kind == "regex"
          ? {
              regex: check.regex.source,
              ...(check.regex.flags ? { flags: check.regex.flags } : {}),
            }
          : check.kind == "ip"
          ? { kind: "ip", version: check.version }
          : check.kind == "datetime"
          ? {
              kind: "datetime",
              ...(check.offset ? { offset: check.offset } : {}),
              ...(typeof check.precision === "number"
                ? { precision: check.precision }
                : {}),
            }
          : STRING_KINDS.has(check.kind)
          ? {
              kind: check.kind,
              /* c8 ignore next 2 -- Guard */
            }
          : {}),
      }),
      {}
    );
    return { type: "string", description: def.description, ...checks };
  },
  ZodBoolean: (def) => ({ type: "boolean", description: def.description }),
  ZodNaN: (def) => ({ type: "nan", description: def.description }),
  ZodBigInt: (def) => {
    const checks = def.checks.reduce(
      (o, check) => ({
        ...o,
        ...(check.kind == "min"
          ? {
              min: check.value,
              ...(check.inclusive ? { minInclusive: true } : {}),
            }
          : check.kind == "max"
          ? {
              max: check.value,
              ...(check.inclusive ? { maxInclusive: true } : {}),
            }
          : check.kind == "multipleOf"
          ? {
              multipleOf: check.value,
              /* c8 ignore next 2 -- Guard */
            }
          : {}),
      }),
      {}
    );
    return { type: "bigInt", description: def.description, ...checks };
  },
  ZodDate: (def) => {
    const checks = def.checks.reduce(
      (o, check) => ({
        ...o,
        ...(check.kind == "min"
          ? { min: check.value }
          : check.kind == "max"
          ? {
              max: check.value,
              /* c8 ignore next 2 -- Guard */
            }
          : {}),
      }),
      {}
    );
    return { type: "date", description: def.description, ...checks };
  },
  ZodUndefined: (def) => ({ type: "undefined", description: def.description }),
  ZodNull: (def) => ({ type: "null", description: def.description }),
  ZodAny: (def) => ({ type: "any", description: def.description }),
  ZodUnknown: (def) => ({ type: "unknown", description: def.description }),
  ZodNever: (def) => ({ type: "never", description: def.description }),
  ZodVoid: (def) => ({ type: "void", description: def.description }),

  ZodLiteral: (def) => ({
    type: "literal",
    description: def.description,
    value: def.value,
  }),

  ZodTuple: (def) => ({
    type: "tuple",
    description: def.description,
    items: def.items.map(zerialize),
    ...(def.rest
      ? {
          rest: zerialize(def.rest),
        }
      : {}),
  }),
  ZodSet: (def) => ({
    type: "set",
    description: def.description,
    value: zerialize(def.valueType),
    ...(def.minSize === null ? {} : { minSize: def.minSize.value }),
    ...(def.maxSize === null ? {} : { maxSize: def.maxSize.value }),
  }),
  ZodArray: (def) => ({
    type: "array",
    description: def.description,
    element: zerialize(def.type),

    ...(def.exactLength === null
      ? {}
      : {
          minLength: def.exactLength.value,
          maxLength: def.exactLength.value,
        }),
    ...(def.minLength === null ? {} : { minLength: def.minLength.value }),
    ...(def.maxLength === null ? {} : { maxLength: def.maxLength.value }),
  }),

  ZodObject: (def) => ({
    type: "object",
    description: def.description,
    properties: Object.fromEntries(
      Object.entries(def.shape()).map(([key, value]) => [
        key,
        zerialize(value as Schema),
      ])
    ),
  }),
  ZodRecord: (def) => ({
    type: "record",
    description: def.description,
    key: zerialize(def.keyType),
    value: zerialize(def.valueType),
  }),
  ZodMap: (def) => ({
    type: "map",
    description: def.description,
    key: zerialize(def.keyType),
    value: zerialize(def.valueType),
  }),

  ZodEnum: (def) => ({
    type: "enum",
    description: def.description,
    values: def.values,
  }),
  // TODO: turn into enum
  ZodNativeEnum: (def) => ({ type: "unknown", description: def.description }),

  ZodUnion: (def) => ({
    type: "union",
    description: def.description,
    options: def.options.map(zerialize),
  }),
  ZodDiscriminatedUnion: (def) => ({
    type: "discriminatedUnion",
    description: def.description,
    discriminator: def.discriminator,
    options: def.options.map(zerialize),
  }),
  ZodIntersection: (def) => ({
    type: "intersection",
    description: def.description,
    left: zerialize(def.left),
    right: zerialize(def.right),
  }),

  ZodFunction: (def) => ({
    type: "function",
    description: def.description,
    args: zerialize(def.args),
    returns: zerialize(def.returns),
  }),
  ZodPromise: (def) => ({
    type: "promise",
    description: def.description,
    value: zerialize(def.type),
  }),

  ZodLazy: (def) => zerialize(def.getter()),
  ZodEffects: (def) => zerialize(def.schema),
  ZodBranded: (def) => zerialize(def.type),
  ZodPipeline: (def) => zerialize(def.out),
  ZodCatch: (def) => zerialize(def.innerType),
} satisfies ZerializersMap as ZerializersMap;

// Must match the exported Zerialize types
export function zerialize<T extends Schema>(_schema: T): Zerialize<T>;
export function zerialize(schema: Schema): unknown {
  const { _def: def } = schema;
  return zerializers[def.typeName](def as any);
}
