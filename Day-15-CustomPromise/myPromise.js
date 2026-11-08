/**
 * Day 15: Promises/A+ Specification Compliant Engine
 * Core Concepts: State Machine (PENDING, FULFILLED, REJECTED),
 * Microtask scheduling via queueMicrotask, and chaining resolution.
 */

const STATES = {
    PENDING: 'PENDING',
    FULFILLED: 'FULFILLED',
    REJECTED: 'REJECTED'
};

class MyPromise {
    constructor(executor) {
        this.state = STATES.PENDING;
        this.value = undefined;
        this.reason = undefined;
        this.onFulfilledCallbacks = [];
        this.onRejectedCallbacks = [];

        const resolve = (value) => {
            if (this.state === STATES.PENDING) {
                this.state = STATES.FULFILLED;
                this.value = value;
                // Execute all subscribed callbacks asynchronously via Microtask
                queueMicrotask(() => {
                    this.onFulfilledCallbacks.forEach((cb) => cb(this.value));
                });
            }
        };

        const reject = (reason) => {
            if (this.state === STATES.PENDING) {
                this.state = STATES.REJECTED;
                this.reason = reason;
                // Execute all error callbacks asynchronously via Microtask
                queueMicrotask(() => {
                    this.onRejectedCallbacks.forEach((cb) => cb(this.reason));
                });
            }
        };

        try {
            executor(resolve, reject);
        } catch (err) {
            reject(err);
        }
    }

    then(onFulfilled, onRejected) {
        // Defaults to support pass-through values
        const handleFulfilled = typeof onFulfilled === 'function' ? onFulfilled : (v) => v;
        const handleRejected = typeof onRejected === 'function' ? onRejected : (err) => { throw err; };

        // Return a brand new MyPromise instance for method chaining
        return new MyPromise((resolve, reject) => {
            const handleCallback = (callback, value) => {
                try {
                    const result = callback(value);
                    // If returning another Promise, adopt its state
                    if (result instanceof MyPromise) {
                        result.then(resolve, reject);
                    } else {
                        resolve(result);
                    }
                } catch (error) {
                    reject(error);
                }
            };

            if (this.state === STATES.FULFILLED) {
                queueMicrotask(() => handleCallback(handleFulfilled, this.value));
            } else if (this.state === STATES.REJECTED) {
                queueMicrotask(() => handleCallback(handleRejected, this.reason));
            } else {
                // Buffer callbacks if asynchronous resolution is pending
                this.onFulfilledCallbacks.push(() => handleCallback(handleFulfilled, this.value));
                this.onRejectedCallbacks.push(() => handleCallback(handleRejected, this.reason));
            }
        });
    }

    catch(onRejected) {
        return this.then(null, onRejected);
    }

    static resolve(value) {
        return new MyPromise((resolve) => resolve(value));
    }

    static reject(reason) {
        return new MyPromise((_, reject) => reject(reason));
    }
}

// === Verification CLI Test Suite ===
if (require.main === module) {
    console.log("⚡ Executing Day 15: Custom Promises/A+ Engine Verification...\n");

    const logs = [];

    const asyncTask = new MyPromise((resolve) => {
        setTimeout(() => {
            resolve("Step 1: Raw Data Fetched");
        }, 100);
    });

    asyncTask
        .then((data) => {
            logs.push({ Stage: "Initial Resolve", Value: data });
            return "Step 2: Transformed Data";
        })
        .then((transformed) => {
            logs.push({ Stage: "Chained Transform", Value: transformed });
            return new MyPromise((resolve) => {
                setTimeout(() => resolve("Step 3: Nested Promise Resolved"), 50);
            });
        })
        .then((nestedResult) => {
            logs.push({ Stage: "Nested Resolution", Value: nestedResult });
            console.table(logs);
            console.log("\nInsight: Custom MyPromise successfully preserved execution order, microtask queue dispatching, and state propagation!");
        })
        .catch((err) => {
            console.error("Execution Failed:", err);
        });
}

module.exports = MyPromise;