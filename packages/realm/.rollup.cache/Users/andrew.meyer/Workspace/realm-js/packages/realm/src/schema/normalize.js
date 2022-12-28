////////////////////////////////////////////////////////////////////////////
//
// Copyright 2022 Realm Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
////////////////////////////////////////////////////////////////////////////
import { RealmObject, TYPE_MAPPINGS, assert, flags, } from "../internal";
export const PRIMITIVE_TYPES = new Set([
    "bool",
    "int",
    "float",
    "double",
    "decimal128",
    "objectId",
    "string",
    "data",
    "date",
    "mixed",
    "uuid",
]);
function isPrimitive(type) {
    return PRIMITIVE_TYPES.has(type);
}
function validateCanonicalPropertySchema(objectSchemaName, { name, type, objectType, optional }) {
    if (type === "list" && objectType === "list") {
        throw new Error(`List property '${objectSchemaName}#${name}' cannot have list elements`);
    }
    if (type === "list" && !isPrimitive(objectType) && optional) {
        throw new Error(`List property '${objectSchemaName}#${name}' of '${objectType}' elements, cannot be optional`);
    }
    if (objectType === "") {
        throw new Error(`Property '${objectSchemaName}#${name}' cannot have an empty object type`);
    }
}
export const COLLECTION_TYPES = ["set", "dictionary", "list"];
function removeUndefinedValues(obj) {
    return Object.fromEntries(Object.entries(obj).filter(([, v]) => typeof v !== "undefined"));
}
export function normalizeRealmSchema(schema) {
    return schema.map(normalizeObjectSchema);
}
export function normalizeObjectSchema(arg) {
    if (typeof arg === "function") {
        assert.extends(arg, RealmObject);
        assert.object(arg.schema, "schema static");
        const schema = normalizeObjectSchema(arg.schema);
        schema.constructor = arg;
        return schema;
    }
    else {
        // TODO: Determine if we still want to support this
        if (Array.isArray(arg.properties)) {
            if (flags.ALLOW_VALUES_ARRAYS) {
                return normalizeObjectSchema({
                    ...arg,
                    properties: Object.fromEntries(arg.properties.map(({ name, ...rest }) => [name, rest])),
                });
            }
            else {
                throw new Error("Array of properties are no longer supported");
            }
        }
        return {
            constructor: undefined,
            name: arg.name,
            primaryKey: arg.primaryKey,
            asymmetric: arg.asymmetric || false,
            embedded: arg.embedded || false,
            properties: Object.fromEntries(Object.entries(arg.properties).map(([name, property]) => {
                const canonicalPropertySchema = normalizePropertySchema(name, property);
                // A primary key is always indexed
                if (name === arg.primaryKey) {
                    canonicalPropertySchema.indexed = true;
                }
                validateCanonicalPropertySchema(arg.name, canonicalPropertySchema);
                return [name, canonicalPropertySchema];
            })),
        };
    }
}
// TODO: Extend to handle all short hands
export function normalizePropertySchema(name, schema) {
    if (typeof schema === "string") {
        return normalizePropertySchema(name, normalizePropertyType(schema));
    }
    else {
        const { type, ...rest } = schema;
        const propertySchemaFromType = normalizePropertyType(type, typeof rest.objectType !== "string");
        // Type casting, since it is expected that `normalizePropertyType` moves an object linked type into `objectType`
        const mergedSchema = {
            ...removeUndefinedValues(propertySchemaFromType),
            ...removeUndefinedValues(rest),
        };
        if (mergedSchema.type === "mixed" || mergedSchema.objectType === "mixed") {
            assert(mergedSchema.optional !== false, "Mixed values should be declared as optional");
        }
        const result = {
            indexed: false,
            optional: false,
            mapTo: name,
            ...mergedSchema,
            name,
        };
        return result;
    }
}
export function normalizePropertyType(type, allowObjectType = true) {
    if (type.endsWith("[]")) {
        assert(allowObjectType, "Expected no 'objectType' in property schema, when using '[]' shorthand");
        const item = normalizePropertyType(type.substring(0, type.length - 2));
        assert(item.type === "object" || !item.objectType, `Unexpected nested object type ${item.objectType}`);
        return {
            type: "list",
            objectType: item.type === "object" ? item.objectType : item.type,
            optional: item.type === "object" ? false : !!item.optional,
        };
    }
    else if (type.endsWith("<>")) {
        assert(allowObjectType, "Expected no 'objectType' in property schema, when using '<>' shorthand");
        const itemType = type.substring(0, type.length - 2);
        // Item type defaults to mixed
        const item = itemType ? normalizePropertyType(itemType) : { type: "mixed" };
        return {
            type: "set",
            objectType: item.type === "object" ? item.objectType : item.type,
            optional: item.type === "object" ? true : !!item.optional,
        };
    }
    else if (type.endsWith("{}")) {
        assert(allowObjectType, "Expected no 'objectType' in property schema, when using '{}' shorthand");
        const itemType = type.substring(0, type.length - 2);
        // Item type defaults to mixed
        const item = itemType ? normalizePropertyType(itemType) : { type: "mixed", optional: true };
        return {
            type: "dictionary",
            objectType: item.type === "object" ? item.objectType : item.type,
            optional: item.type === "object" ? true : !!item.optional,
        };
    }
    else if (type.endsWith("?")) {
        return {
            optional: true,
            type: type.substring(0, type.length - 1),
        };
    }
    else if (type in TYPE_MAPPINGS) {
        if (type === "dictionary") {
            return { type, objectType: "mixed", optional: true };
        }
        else if (type === "set") {
            return { type, objectType: "mixed", optional: true };
        }
        else if (type === "mixed") {
            return { type, optional: true };
        }
        else {
            // This type is directly mappable, so it can't be the name a user defined object schema.
            return { type };
        }
    }
    else {
        return { type: "object", objectType: type, optional: true };
    }
}
export function extractGeneric(type) {
    const bracketStart = type.indexOf("<");
    const bracketEnd = type.indexOf(">", bracketStart);
    if (bracketStart === -1) {
        return { typeBase: type };
    }
    else {
        return { typeBase: type.substring(0, bracketStart), typeArgument: type.substring(bracketStart + 1, bracketEnd) };
    }
}
//# sourceMappingURL=normalize.js.map