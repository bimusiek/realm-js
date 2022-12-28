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
import { IllegalConstructorError, OrderedCollection, assert, binding, } from "./internal";
/**
 * Instances of this class will be returned when accessing object properties whose type is `"list"`.
 *
 * Lists mostly behave like normal Javascript Arrays, except for that they can
 * only store values of a single type (indicated by the `type` and `optional`
 * properties of the List), and can only be modified inside a {@link Realm.write | write} transaction.
 *
 * @extends Realm.Collection
 * @memberof Realm
 */
export class List extends OrderedCollection {
    /**
     * The representation in the binding.
     * @internal
     */
    internal;
    /** @internal */
    isEmbedded;
    /** @internal */
    constructor(realm, internal, helpers) {
        if (arguments.length === 0 || !(internal instanceof binding.List)) {
            throw new IllegalConstructorError("List");
        }
        super(realm, internal.asResults(), helpers);
        // Getting the `objectSchema` off the internal will throw if base type isn't object
        const baseType = this.results.type & ~960 /* binding.PropertyType.Flags */;
        const isEmbedded = baseType === 7 /* binding.PropertyType.Object */ && internal.objectSchema.tableType === 1 /* binding.TableType.Embedded */;
        Object.defineProperties(this, {
            internal: {
                enumerable: false,
                configurable: false,
                writable: false,
                value: internal,
            },
            isEmbedded: {
                enumerable: false,
                configurable: false,
                writable: false,
                value: isEmbedded,
            },
        });
    }
    isValid() {
        return this.internal.isValid;
    }
    /**
     * Set an element of the ordered collection by index
     * @param index The index
     * @param value The value
     * @internal
     */
    set(index, value) {
        const { realm, internal, isEmbedded, helpers: { toBinding }, } = this;
        assert.inTransaction(realm);
        // TODO: Consider a more performant way to determine if the list is embedded
        internal.setAny(index, toBinding(value, isEmbedded ? () => [internal.insertEmbedded(index), true] : undefined));
    }
    get length() {
        return this.internal.size;
    }
    /**
     * Remove the **last** value from the list and return it.
     * @throws {@link AssertionError} If not inside a write transaction.
     * @returns The last value or undefined if the list is empty.
     */
    pop() {
        assert.inTransaction(this.realm);
        const { internal, helpers: { fromBinding }, } = this;
        const lastIndex = internal.size - 1;
        if (lastIndex >= 0) {
            const result = fromBinding(internal.getAny(lastIndex));
            internal.remove(lastIndex);
            return result;
        }
    }
    /**
     * Add one or more values to the _end_ of the list.
     *
     * @param items Values to add to the list.
     * @throws {TypeError} If a `value` is not of a type which can be stored in
     *   the list, or if an object being added to the list does not match the {@link Realm.ObjectSchema} for the list.
     *
     * @throws {@link AssertionError} If not inside a write transaction.
     * @returns A number equal to the new length of
     *          the list after adding the values.
     */
    push(...items) {
        assert.inTransaction(this.realm);
        const { isEmbedded, internal, helpers: { toBinding }, } = this;
        const start = internal.size;
        for (const [offset, item] of items.entries()) {
            const index = start + offset;
            if (isEmbedded) {
                // Simply transforming to binding will insert the embedded object
                toBinding(item, () => [internal.insertEmbedded(index), true]);
            }
            else {
                internal.insertAny(index, toBinding(item));
            }
        }
        return internal.size;
    }
    /**
     * Remove the **first** value from the list and return it.
     * @throws {@link AssertionError} If not inside a write transaction.
     * @returns The first value or undefined if the list is empty.
     */
    shift() {
        assert.inTransaction(this.realm);
        const { internal, helpers: { fromBinding }, } = this;
        if (internal.size > 0) {
            const result = fromBinding(internal.getAny(0));
            internal.remove(0);
            return result;
        }
    }
    /**
     * Add one or more values to the _beginning_ of the list.
     *
     * @param items Values to add to the list.
     * @throws {TypeError} If a `value` is not of a type which can be stored in
     * the list, or if an object being added to the list does not match the {@link Realm.ObjectSchema} for the list.
     * @throws {@link AssertionError} If not inside a write transaction.
     * @returns The new {@link length} of the list after adding the values.
     */
    unshift(...items) {
        assert.inTransaction(this.realm);
        const { isEmbedded, internal, helpers: { toBinding }, } = this;
        for (const [index, item] of items.entries()) {
            if (isEmbedded) {
                // Simply transforming to binding will insert the embedded object
                toBinding(item, () => [internal.insertEmbedded(index), true]);
            }
            else {
                internal.insertAny(index, toBinding(item));
            }
        }
        return internal.size;
    }
    /**
     * Changes the contents of the list by removing value and/or inserting new value.
     *
     * @see {@link https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice Array.prototype.splice}
     * @param start The start index. If greater than the length of the list,
     *   the start index will be set to the length instead. If negative, then the start index
     *   will be counted from the end of the list (e.g. `list.length - index`).
     * @param deleteCount The number of values to remove from the list.
     *   If not provided, then all values from the start index through the end of
     *   the list will be removed.
     * @param items Values to insert into the list starting at `index`.
     * @returns An array containing the value that were removed from the list. The
     *   array is empty if no value were removed.
     */
    splice(start, deleteCount, ...items) {
        // Comments in the code below is copied from https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice
        assert.inTransaction(this.realm);
        assert.number(start, "start");
        const { isEmbedded, internal, helpers: { fromBinding, toBinding }, } = this;
        // If negative, it will begin that many elements from the end of the array.
        if (start < 0) {
            start = internal.size + start;
        }
        // If greater than the length of the array, start will be set to the length of the array.
        if (start > internal.size) {
            start = internal.size;
        }
        // If deleteCount is omitted, or if its value is equal to or larger than array.length - start
        // (that is, if it is equal to or greater than the number of elements left in the array, starting at start),
        // then all the elements from start to the end of the array will be deleted.
        const end = typeof deleteCount === "number" ? Math.min(start + deleteCount, internal.size) : internal.size;
        // Get the elements that are about to be deleted
        const result = [];
        for (let i = start; i < end; i++) {
            result.push(fromBinding(internal.getAny(i)));
        }
        // Remove the elements from the list (backwards to avoid skipping elements as they're being deleted)
        for (let i = end - 1; i >= start; i--) {
            internal.remove(i);
        }
        // Insert any new elements
        for (const [offset, item] of items.entries()) {
            const index = start + offset;
            if (isEmbedded) {
                // Simply transforming to binding will insert the embedded object
                toBinding(item, () => [internal.insertEmbedded(index), true]);
            }
            else {
                internal.insertAny(index, toBinding(item));
            }
        }
        return result;
    }
}
//# sourceMappingURL=List.js.map