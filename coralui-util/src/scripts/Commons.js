/*
 * ADOBE CONFIDENTIAL
 *
 * Copyright 2017 Adobe Systems Incorporated
 * All Rights Reserved.
 *
 * NOTICE:  All information contained herein is, and remains
 * the property of Adobe Systems Incorporated and its suppliers,
 * if any.  The intellectual and technical concepts contained
 * herein are proprietary to Adobe Systems Incorporated and its
 * suppliers and may be covered by U.S. and Foreign Patents,
 * patents in process, and are protected by trade secret or copyright law.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe Systems Incorporated.
 */

import ResizeObserver from './ResizeObserver';
import {Promise} from 'coralui-externals';

// Used for unique IDs
let nextID = 0;

// Threshold time in milliseconds that the setTimeout will wait for the transitionEnd event to be triggered.
const TRANSITION_DURATION_THRESHOLD = 100;

// Based on jQuery's :focusable selector
const FOCUSABLE_ELEMENTS = [
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  'area[href]',
  'summary',
  'iframe',
  'object',
  'embed',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]'
];

/**
 Converts CSS time to milliseconds. It supports both s and ms units. If the provided value has an unrecogenized unit,
 zero will be returned.
 
 @private
 @param {String} time
 The time string to convert to milliseconds.
 @returns {Number} the time in milliseconds.
 */
function cssTimeToMilliseconds(time) {
  const num = parseFloat(time, 10);
  let unit = time.match(/m?s/);
  
  if (unit) {
    unit = unit[0];
  }
  
  if (unit === 's') {
    return num * 1000;
  }
  else if (unit === 'ms') {
    return num;
  }
  
  // unrecognized unit, so we return 0
  return 0;
}

/**
 @private
 
 @param first
 @param second
 @return {Function}
 */
function returnFirst(first, second) {
  // eslint-disable-next-line func-names
  return function(...args) {
    const ret = first.apply(this, args);
    second.apply(this, args);
    return ret;
  };
}

/**
 Check if the provided object is a function
 
 @ignore
 
 @param {*} object
 The object to test
 
 @returns {Boolean} Whether the provided object is a function.
 */
function isFunction(object) {
  return typeof object === 'function';
}

/**
 Coral utility belt.
 */
class Commons {
  /** @ignore */
  constructor() {
    this._resizeEvent = new ResizeObserver();
    
    const focusableElements = FOCUSABLE_ELEMENTS.slice();
    this._focusableElementsSelector = focusableElements.join(',');
  
    focusableElements.push('[tabindex]:not([tabindex="-1"])');
    this._tabbableElementsSelector = focusableElements.join(':not([tabindex="-1"]),');
  }
  /**
   Copy the properties from all provided objects into the first object.
   
   @param {Object} dest
   The object to copy properties to
   @param {...Object} source
   An object to copy properties from. Additional objects can be passed as subsequent arguments.
   
   @returns {Object}
   The destination object, <code>dest</code>
   */
  extend(...args) {
    const dest = args[0];
    for (let i = 1, ni = args.length; i < ni; i++) {
      const source = args[i];
      for (const prop in source) {
        dest[prop] = source[prop];
      }
    }
    return dest;
  }
  
  /**
   Copy the properties from the source object to the destination object, but calls the callback if the property is
   already present on the destination object.
   
   @param {Object} dest
   The object to copy properties to
   @param {...Object} source
   An object to copy properties from. Additional objects can be passed as subsequent arguments.
   @param {CommonsHandleCollision} [handleCollision]
   Called if the property being copied is already present on the destination.
   The return value will be used as the property value.
   
   @returns {Object}
   The destination object, <code>dest</code>
   */
  augment(...args) {
    const dest = args[0];
    let handleCollision;
    let argCount = args.length;
    const lastArg = args[argCount - 1];
    
    if (typeof lastArg === 'function') {
      handleCollision = lastArg;
      
      // Don't attempt to augment using the last argument
      argCount--;
    }
    
    for (let i = 1; i < argCount; i++) {
      const source = args[i];
      
      for (const prop in source) {
        if (typeof dest[prop] !== 'undefined') {
          if (typeof handleCollision === 'function') {
            // Call the handleCollision callback if the property is already present
            const ret = handleCollision(dest[prop], source[prop], prop, dest, source);
            if (typeof ret !== 'undefined') {
              dest[prop] = ret;
            }
          }
          // Otherwise, do nothing
        }
        else {
          dest[prop] = source[prop];
        }
      }
    }
    
    return dest;
  }
  
  /**
   Return a new object with the swapped keys and values of the provided object.
   
   @param {Object} obj
   The object to copy.
   
   @returns {Object}
   An object with its keys as the values and values as the keys of the source object.
   */
  swapKeysAndValues(obj) {
    const map = {};
    for (const key in obj) {
      map[obj[key]] = key;
    }
    return map;
  }
  
  /**
   Execute the provided callback on the next animation frame.
   @function
   @param {Function} onNextFrame
   The callback to execute.
   @deprecated
   */
  nextFrame(onNextFrame) {
    console.warn('Coral.commons.nextFrame has been deprecated. Please use window.requestAnimationFrame instead.');
    
    return window.requestAnimationFrame(() => {
      if (typeof onNextFrame === 'function') {
        onNextFrame();
      }
    });
  }
  
  /**
   Execute the provided callback once a CSS transition has ended. This method listens for the next transitionEnd event
   on the given DOM element. In case the provided element does not have a transition defined, the callback will be
   called in the next macrotask to allow a normal application execution flow. It cannot be used to listen continuously
   on transitionEnd events.
   @param {HTMLElement} element
   The DOM element that is affected by the CSS transition.
   @param {CommonsTransitionEndCallback} onTransitionEndCallback
   The callback to execute.
   */
  transitionEnd(element, onTransitionEndCallback) {
    let propertyName;
    let hasTransitionEnded = false;
    let transitionEndEventName = null;
    const transitions = {
      transition: 'transitionend',
      WebkitTransition: 'webkitTransitionEnd',
      MozTransition: 'transitionend',
      MSTransition: 'msTransitionEnd'
    };
    
    let transitionEndTimeout = null;
    const onTransitionEnd = (event) => {
      const transitionStoppedByTimeout = typeof event === 'undefined';
      
      if (!hasTransitionEnded) {
        hasTransitionEnded = true;
        
        clearTimeout(transitionEndTimeout);
        
        // Remove event listener (if any was used by the current browser)
        element.removeEventListener(transitionEndEventName, onTransitionEnd);
        
        // Call callback with specified element
        onTransitionEndCallback({
          target: element,
          cssTransitionSupported: true,
          transitionStoppedByTimeout: transitionStoppedByTimeout
        });
      }
    };
    
    // Find transitionEnd event name used by browser
    for (propertyName in transitions) {
      if (element.style[propertyName] !== undefined) {
        transitionEndEventName = transitions[propertyName];
        break;
      }
    }
    
    if (transitionEndEventName !== null) {
      let timeoutDelay = 0;
      // Gets the animation time (in milliseconds) using the computed style
      const transitionDuration = cssTimeToMilliseconds(window.getComputedStyle(element).transitionDuration);
      
      // We only setup the event listener if there is a valid transition
      if (transitionDuration !== 0) {
        // Register on transitionEnd event
        element.addEventListener(transitionEndEventName, onTransitionEnd);
        
        // As a fallback we use the transitionDuration plus a threshold. This can happen in IE10/11 where
        // transitionEnd events are sometimes skipped
        timeoutDelay = transitionDuration + TRANSITION_DURATION_THRESHOLD;
      }
      
      // Fallback in case the event does not trigger (IE10/11) or if the element does not have a valid transition
      transitionEndTimeout = window.setTimeout(onTransitionEnd, timeoutDelay);
    }
  }
  
  /**
   Checks if Coral components and all nested Coral components are defined as Custom Elements.
   
   @param {HTMLElement} element
   The element that should be watched.
   @param {CommonsReadyCallback} onDefined
   The callback to call when all components are ready.
   
   @see https://developer.mozilla.org/en-US/docs/Web/Web_Components/Custom_Elements
   */
  ready(element, onDefined) {
    let root = element;
    
    if (typeof element === 'function') {
      onDefined = element;
      root = document.body;
    }
    
    if (!root) {
      root = document.body;
    }
    
    if (!(root instanceof HTMLElement)) {
      console.warn('Coral.commons.ready: passed element was not an HTMLElement.');
      // commons.ready should not be blocking by default
      onDefined(root);
      return;
    }
    
    // @todo use ':not(:defined)' once supported to detect coral not yet defined custom elements
    const elements = root.querySelectorAll('*');
    
    // Holds promises that resolve when the elements is defined
    const promises = [];
    
    // Finds the custom elements name and adds it to the promises
    const addName = function(el) {
      let name = el.nodeName.toLowerCase();
      
      // Check nodename
      if (name.indexOf('coral') === 0 && el instanceof HTMLUnknownElement) {
        promises.push(window.customElements.whenDefined(name));
      }
      else {
        // Fallback to is attribute
        name = String(el.getAttribute('is')).toLowerCase();
        
        if (name.indexOf('coral') === 0 && el instanceof HTMLUnknownElement) {
          promises.push(window.customElements.whenDefined(name));
        }
      }
    };
    
    // Don't forget to check root
    addName(root);
    
    // Check all descending elements
    for (let i = 0; i < elements.length; i++) {
      addName(elements[i]);
    }
    
    // Call callback once all defined
    if (promises.length) {
      Promise.all(promises)
        .then(() => {
          onDefined(element instanceof HTMLElement && element || window);
        })
        .catch((err) => {
          console.error(err);
        });
    }
    else {
      // Call callback by default if all defined already
      onDefined(element instanceof HTMLElement && element || window);
    }
  }
  
  
  /**
   Assign an object given a nested path
   
   @param {Object} root
   The root object on which the path should be traversed.
   @param {String} path
   The path at which the object should be assignment.
   @param {String} obj
   The object to assign at path.
   
   @throws Will throw an error if the path is not present on the object.
   */
  setSubProperty(root, path, obj) {
    const nsParts = path.split('.');
    let curObj = root;
    
    if (nsParts.length === 1) {
      // Assign immediately
      curObj[path] = obj;
      return;
    }
    
    // Make sure we can assign at the requested location
    while (nsParts.length > 1) {
      const part = nsParts.shift();
      if (curObj[part]) {
        curObj = curObj[part];
      }
      else {
        throw new Error(`Coral.commons.setSubProperty: could not set ${path}, part ${part} not found`);
      }
    }
    
    // Do the actual assignment
    curObj[nsParts.shift()] = obj;
  }
  
  
  /**
   Get the value of the property at the given nested path.
   
   @param {Object} root
   The root object on which the path should be traversed.
   @param {String} path
   The path of the sub-property to return.
   
   @returns {*}
   The value of the provided property.
   
   @throws Will throw an error if the path is not present on the object.
   */
  getSubProperty(root, path) {
    const nsParts = path.split('.');
    let curObj = root;
    
    if (nsParts.length === 1) {
      // Return property immediately
      return curObj[path];
    }
    
    // Make sure we can assign at the requested location
    while (nsParts.length) {
      const part = nsParts.shift();
      // The property might be undefined, and that's OK if it's the last part
      if (nsParts.length === 0 || typeof curObj[part] !== 'undefined') {
        curObj = curObj[part];
      }
      else {
        throw new Error(`Coral.commons.getSubProperty: could not get ${path}, part ${part} not found`);
      }
    }
    
    return curObj;
  }
  
  /**
   Apply a mixin to the given object.
 
   @deprecated
   
   @param {Object} target
   The object to apply the mixin to.
   @param {Object|Function} mixin
   The mixin to apply.
   @param {Object} options
   An object to pass to functional mixins.
   */
  _applyMixin(target, mixin, options) {
    const mixinType = typeof mixin;
    
    if (mixinType === 'function') {
      mixin(target, options);
    }
    else if (mixinType === 'object' && mixin !== null) {
      this.extend(target, mixin);
    }
    else {
      throw new Error(`Coral.commons.mixin: Cannot mix in ${mixinType} to ${target.toString()}`);
    }
  }
  
  /**
   Mix a set of mixins to a target object.
 
   @deprecated
   @private
   
   @param {Object} target
   The target prototype or instance on which to apply mixins.
   @param {Object|CoralMixin|Array<Object|CoralMixin>} mixins
   A mixin or set of mixins to apply.
   @param {Object} options
   An object that will be passed to functional mixins as the second argument (options).
   */
  mixin(target, mixins, options) {
    if (Array.isArray(mixins)) {
      for (let i = 0; i < mixins.length; i++) {
        this._applyMixin(target, mixins[i], options);
      }
    }
    else {
      this._applyMixin(target, mixins, options);
    }
  }
  
  /**
   Get a unique ID.
   
   @returns {String} unique identifier.
   */
  getUID() {
    return `coral-id-${nextID++}`;
  }
  
  /**
   Call all of the provided functions, in order, returning the return value of the specified function.
   
   @param {...Function} func
   A function to call
   @param {Number} [nth=0]
   A zero-based index indicating the noth argument to return the value of.
   If the nth argument is not a function, <code>null</code> will be returned.
   
   @returns {Function} The aggregate function.
   */
  callAll(...args) {
    let nth = args[args.length - 1];
    if (typeof nth !== 'number') {
      nth = 0;
    }
    
    // Get the function whose value we should return
    let funcToReturn = args[nth];
    
    // Only use arguments that are functions
    const functions = Array.prototype.filter.call(args, isFunction);
    
    if (functions.length === 2 && nth === 0) {
      // Most common usecase: two valid functions passed
      return returnFirst(functions[0], functions[1]);
    }
    else if (functions.length === 1) {
      // Common usecase: one valid function passed
      return functions[0];
    }
    else if (functions.length === 0) {
      return () => {
        // Fail case: no valid functions passed
      };
    }
    
    if (typeof funcToReturn !== 'function') {
      // If the argument at the provided index wasn't a function, just return the value of the first valid function
      funcToReturn = functions[0];
    }
    
    // eslint-disable-next-line func-names
    return function() {
      let finalRet;
      let ret;
      let func;
      
      // Skip first arg
      for (let i = 0; i < functions.length; i++) {
        func = functions[i];
        ret = func.apply(this, args);
        
        // Store return value of desired function
        if (func === funcToReturn) {
          finalRet = ret;
        }
      }
      return finalRet;
    };
  }
  
  /**
   Adds a resize listener to the given element.
   
   @param {HTMLElement} element
   The element to add the resize event to.
   @param {Function} onResize
   The resize callback.
   */
  // eslint-disable-next-line func-names
  addResizeListener(element, onResize) {
    this._resizeEvent._addResizeListener(element, onResize);
  }
  
  /**
   Removes a resize listener from the given element.
   
   @param {HTMLElement} element
   The element to remove the resize event from.
   @param {Function} onResize
   The resize callback.
   */
  // eslint-disable-next-line func-names
  removeResizeListener(element, onResize) {
    this._resizeEvent._removeResizeListener(element, onResize);
  }
  
  /**
   Caution: the selector doesn't verify if elements are visible.
   
   @type {String}
   @readonly
   @see https://www.w3.org/TR/html5/editing.html#focus-management
   */
  get FOCUSABLE_ELEMENT_SELECTOR() {
    return this._focusableElementsSelector;
  }
  
  /**
   Caution: the selector doesn't verify if elements are visible.
   
   @type {String}
   @readonly
   @see https://www.w3.org/TR/html5/editing.html#sequential-focus-navigation-and-the-tabindex-attribute
   */
  get TABBABLE_ELEMENT_SELECTOR() {
    return this._tabbableElementsSelector;
  }
}

/**
 Called when a property already exists on the destination object.
 
 @typedef {function} CommonsHandleCollision
 
 @param {*} oldValue
 The value currently present on the destination object.
 @param {*} newValue
 The value on the destination object.
 @param {*} prop
 The property that collided.
 @param {*} dest
 The destination object.
 @param {*} source
 The source object.
 
 @returns {*} The value to use. If <code>undefined</code>, the old value will be used.
 */


/**
 Execute the callback once a CSS transition has ended.
 
 @typedef {function} CommonsTransitionEndCallback
 
 @param event
 The event passed to the callback.
 @param {HTMLElement} event.target
 The DOM element that was affected by the CSS transition.
 @param {Boolean} event.cssTransitionSupported
 Whether CSS transitions are supported by the browser.
 @param {Boolean} event.transitionStoppedByTimeout
 Whether the CSS transition has been ended by a timeout (should only happen as a fallback).
 */

/**
 Execute the callback once a component and sub-components are ready. See {@link Commons.ready}.
 
 @typedef {function} CommonsReadyCallback
 @param {HTMLElement} element
 The element that is ready.
 */

/**
 A functional mixin.
 
 @typedef {Object} CoralMixin
 
 @deprecated
 @private
 
 @param {Object} target
 The target prototype or instance to apply the mixin to.
 @param {Object} options
 Options for this mixin.
 @param {Coral~PropertyDescriptor.properties} options.properties
 The properties object as passed to <code>Coral.register</code>. This can be modified in place.
 */

/**
 A utility belt.
 
 @type {Commons}
 */
const commons = new Commons();

export default commons;