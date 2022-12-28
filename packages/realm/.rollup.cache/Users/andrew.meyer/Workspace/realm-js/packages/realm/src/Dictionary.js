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
import { Collection, IllegalConstructorError, JSONCacheMap, RealmObject, assert, binding, } from "./internal";
const REALM = Symbol("Dictionary#realm");
const INTERNAL = Symbol("Dictionary#internal");
const HELPERS = Symbol("Dictionary#helpers");
const DEFAULT_PROPERTY_DESCRIPTOR = { configurable: true, enumerable: true };
const PROXY_HANDLER = {
    get(target, prop, receiver) {
        const value = Reflect.get(target, prop, receiver);
        if (typeof value === "undefined" && typeof prop === "string") {
            const internal = target[INTERNAL];
            const fromBinding = target[HELPERS].fromBinding;
            return fromBinding(internal.tryGetAny(prop));
        }
        else {
            return value;
        }
    },
    set(target, prop, value) {
        if (typeof prop === "string") {
            const internal = target[INTERNAL];
            const toBinding = target[HELPERS].toBinding;
            internal.insertAny(prop, toBinding(value, undefined));
            return true;
        }
        else {
            return false;
        }
    },
    deleteProperty(target, prop) {
        // We're intentionally not checking !Reflect.has(target, prop) below to allow deletes to propagage for any key
        if (typeof prop === "string") {
            const internal = target[INTERNAL];
            internal.tryErase(prop);
            // We consider any key without a value as "deleteable", the same way `const foo = {}; delete foo.bar;` returns true
            return true;
        }
        else {
            return false;
        }
    },
    ownKeys(target) {
        const internal = target[INTERNAL];
        const result = Reflect.ownKeys(target);
        // assert(internal.isValid, "Expected a valid dicitonary");
        const keys = internal.keys.snapshot();
        for (let i = 0; i < keys.size(); i++) {
            const key = keys.getAny(i);
            assert.string(key, "dictionary key");
            result.push(key);
        }
        return result;
    },
    getOwnPropertyDescriptor(target, prop) {
        const internal = target[INTERNAL];
        if (typeof prop === "string" && internal.contains(prop)) {
            return {
                ...DEFAULT_PROPERTY_DESCRIPTOR,
                get: PROXY_HANDLER.get?.bind(null, target, prop, null),
                set: PROXY_HANDLER.set?.bind(null, target, prop, null),
            };
        }
        else {
            return Reflect.getOwnPropertyDescriptor(target, prop);
        }
    },
};
/**
 * Instances of this class are returned when accessing object properties whose type is `"Dictionary"`
 *
 * Dictionaries behave mostly like a JavaScript object i.e., as a key/value pair
 * where the key is a string.
 *
 * @memberof Realm
 */
export class Dictionary extends Collection {
    /**
     * Create a `Results` wrapping a set of query `Results` from the binding.
     * @internal
     * @param internal The internal representation of the dictionary.
     */
    constructor(/** @internal */ realm, internal, helpers) {
        if (arguments.length === 0 || !(internal instanceof binding.Dictionary)) {
            throw new IllegalConstructorError("Dictionary");
        }
        super((callback) => {
            return this[INTERNAL].addKeyBasedNotificationCallback(({ deletions, insertions, modifications }) => {
                try {
                    callback(proxied, {
                        deletions: deletions.map((value) => {
                            assert.string(value);
                            return value;
                        }),
                        insertions: insertions.map((value) => {
                            assert.string(value);
                            return value;
                        }),
                        modifications: modifications.map((value) => {
                            assert.string(value);
                            return value;
                        }),
                    });
                }
                catch (err) {
                    // Scheduling a throw on the event loop,
                    // since throwing synchroniously here would result in an abort in the calling C++
                    setImmediate(() => {
                        throw err;
                    });
                }
            }, []);
        });
        const proxied = new Proxy(this, PROXY_HANDLER);
        Object.defineProperties(this, {
            [REALM]: {
                enumerable: false,
                configurable: false,
                writable: false,
                value: realm,
            },
            [INTERNAL]: {
                enumerable: false,
                configurable: false,
                writable: false,
                value: internal,
            },
        });
        this[HELPERS] = helpers;
        return proxied;
    }
    /**
     * The representation in the binding.
     * @internal
     */
    [REALM];
    /**
     * The representation in the binding.
     * @internal
     */
    [INTERNAL];
    /**
     * @internal
     */
    [HELPERS];
    *[Symbol.iterator]() {
        yield* this.entries();
    }
    // @ts-expect-error We're exposing methods in the end-users namespace of keys
    *keys() {
        const snapshot = this[INTERNAL].keys.snapshot();
        const size = snapshot.size();
        for (let i = 0; i < size; i++) {
            const key = snapshot.getAny(i);
            assert.string(key);
            yield key;
        }
    }
    // @ts-expect-error We're exposing methods in the end-users namespace of keys
    *values() {
        const { fromBinding } = this[HELPERS];
        const snapshot = this[INTERNAL].values.snapshot();
        const size = snapshot.size();
        for (let i = 0; i < size; i++) {
            const value = snapshot.getAny(i);
            yield fromBinding(value);
        }
    }
    // @ts-expect-error We're exposing methods in the end-users namespace of keys
    *entries() {
        const { fromBinding } = this[HELPERS];
        const keys = this[INTERNAL].keys.snapshot();
        const values = this[INTERNAL].values.snapshot();
        const size = keys.size();
        assert(size === values.size(), "Expected keys and values to equal in size");
        for (let i = 0; i < size; i++) {
            const key = keys.getAny(i);
            const value = values.getAny(i);
            yield [key, fromBinding(value)];
        }
    }
    // @ts-expect-error We're exposing methods in the end-users namespace of keys
    isValid() {
        return this[INTERNAL].isValid;
    }
    /**
   /**
     * Add a key with a value or update value if key exists.
     * @throws {@link AssertionError} If not inside a write transaction or if value violates type constraints
     * @returns The dictionary
     * @since 10.6.0
     */
    // @ts-expect-error We're exposing methods in the end-users namespace of keys
    set(element) {
        assert.inTransaction(this[REALM]);
        const internal = this[INTERNAL];
        const toBinding = this[HELPERS].toBinding;
        for (const [key, value] of Object.entries(element)) {
            internal.insertAny(key, toBinding(value, undefined));
        }
    }
    /**
     * Removes elements from the dictionary, with the keys provided.
     * This does not throw if the keys are already missing from the dictionary.
     * @param key The key to be removed.
     * @throws {@link AssertionError} If not inside a write transaction.
     * @returns The dictionary
     * @since 10.6.0
     */
    // @ts-expect-error We're exposing methods in the end-users namespace of keys
    remove(key) {
        assert.inTransaction(this[REALM]);
        const internal = this[INTERNAL];
        const keys = typeof key === "string" ? [key] : key;
        for (const k of keys) {
            internal.tryErase(k);
        }
    }
    /** @internal */
    toJSON(_, cache = new JSONCacheMap()) {
        return Object.fromEntries(Object.entries(this).map(([k, v]) => [k, v instanceof RealmObject ? v.toJSON(k, cache) : v]));
    }
}
//# sourceMappingURL=Dictionary.js.map