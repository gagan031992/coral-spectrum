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

import Component from 'coralui-mixin-component';
import FormField from 'coralui-mixin-formfield';
import {SelectableCollection} from 'coralui-collection';
import {Button} from 'coralui-component-button';
import 'coralui-component-icon';
import 'coralui-component-taglist';
import 'coralui-component-overlay';
import 'coralui-component-selectlist';
import base from '../templates/base';
import {transform, validate, commons, i18n} from 'coralui-util';

/**
 Enum for Select variant values.
 
 @enum {String}
 @memberof Coral.Select
 */
const variant = {
  /** A default, gray Select. */
  DEFAULT: 'default',
  /** A Select with no border or background. */
  QUIET: 'quiet'
};

/**
 Offset used to separate the overlay from the button based on the variant.
 
 @private
 */
const overlayOffset = {
  'default': -1,
  'quiet': 4
};

const CLASSNAME = 'coral3-Select';

// builds a string containing all possible variant classnames. This will be used to remove
// classnames when the variant changes.
const ALL_VARIANT_CLASSES = [];
for (const variantKey in variant) {
  ALL_VARIANT_CLASSES.push(CLASSNAME + '--' + variant[variantKey]);
}

// used in 'auto' mode to determine if the client is on mobile.
const IS_MOBILE_DEVICE = navigator.userAgent.match(/iPhone|iPad|iPod|Android/i) !== null;

/**
 Extracts the value from the item in case no explicit value was provided.
 
 @param {HTMLElement} item
 the item whose value will be extracted.
 
 @returns {String} the value that will be submitted for this item.
 
 @private
 */
const itemValueFromDOM = function(item) {
  const attr = item.getAttribute('value');
  // checking explicitely for null allows to differenciate between non set values and empty strings
  return attr !== null ? attr : item.textContent.replace(/\s{2,}/g, ' ').trim();
};

/**
 Calculates the difference between two given arrays. It returns the items that are in a that are not in b.
 
 @param {Array.<String>} a
 @param {Array.<String>} b
 
 @returns {Array.<String>}
 the difference between the arrays.
 */
const arrayDiff = function(a, b) {
  return a.filter(function(item) {
    return !b.some(function(item2) {
      return item === item2;
    });
  });
};

/**
 @class Coral.Select
 @classdesc A Select component
 @htmltag coral-select
 @extends HTMLElement
 @extends Coral.mixin.component
 @extends Coral.mixin.formField
 */
class Select extends FormField(Component(HTMLElement)) {
  constructor() {
    super();

    // Attach events
    this._delegateEvents(commons.extend(this._events, {
      'coral-collection:add coral-taglist': '_onInternalEvent',
      'coral-collection:add coral-selectlist': '_onSelectListItemAdd',

      'coral-collection:remove coral-taglist': '_onInternalEvent',
      'coral-collection:remove coral-selectlist': '_onInternalEvent',

      // item events
      'coral-select-item:_valuechanged coral-select-item': '_onItemValueChange',
      'coral-select-item:_contentchanged coral-select-item': '_onItemContentChange',
      'coral-select-item:_disabledchanged coral-select-item': '_onItemDisabledChange',
      'coral-select-item:_selectedchanged coral-select-item': '_onItemSelectedChange',

      'coral-selectlist:beforechange': '_onSelectListBeforeChange',
      'coral-selectlist:change': '_onSelectListChange',
      'coral-selectlist:scrollbottom': '_onSelectListScrollBottom',

      'change coral-taglist': '_onTagListChange',
      'change select': '_onNativeSelectChange',
      'click select': '_onNativeSelectClick',
      // selector required since tags also have .coral3-Select-button
      'click > .coral3-Select-button': '_onButtonClick',

      'key:space > .coral3-Select-button': '_onSpaceKey',
      'key:down > .coral3-Select-button': '_onSpaceKey',
      'key:tab coral-selectlist-item': '_onTabKey',
      'key:tab+shift coral-selectlist-item': '_onTabKey',
      
      'coral-overlay:close': '_onOverlayToggle',
      'coral-overlay:open': '_onOverlayToggle',
      'coral-overlay:positioned': '_onOverlayPositioned',
      'coral-overlay:beforeopen': '_onInternalEvent',
      'coral-overlay:beforeclose': '_onInternalEvent',

      'global:click': '_onGlobalClick',
      'global:touchstart': '_onGlobalClick'
    }));

    // Templates
    this._elements = {};
    base.call(this._elements);
    
    // default value of inner flag to process events
    this._bulkSelectionChange = false;

    // we only have AUTO mode.
    this._useNativeInput = IS_MOBILE_DEVICE;

    // since reseting a form will call the reset on every component, we need to kill the behavior of the taglist
    // otherwise the state will not be accurate
    this._elements.taglist.reset = function() {};
  
    // handles the focus allocation every time the overlay closes
    this._elements.overlay.returnFocusTo(this._elements.button);

    this._initialValues = [];

    // Init the collection mutation observer
    this.items._startHandlingItems();
  }
  
  /**
   The item collection.
   See {@link Coral.Collection} for more details.
   
   @type {Coral.Collection}
   @readonly
   @memberof Coral.Select#
   */
  get items() {
    // we do lazy initialization of the collection
    if (!this._items) {
      this._items = new SelectableCollection({
        host: this,
        itemTagName: 'coral-select-item',
        onItemAdded: this._onItemAdded,
        onItemRemoved: this._onItemRemoved,
        onCollectionChange: this._onCollectionChange
      });
    }
    return this._items;
  }
  
  /**
   Indicates whether the select accepts multiple selected values.
   
   @type {Boolean}
   @default false
   @htmlattribute multiple
   @htmlattributereflected
   @memberof Coral.Select#
   */
  get multiple() {
    return this._multiple || false;
  }
  set multiple(value) {
    this._multiple = transform.booleanAttr(value);
    this._reflectAttribute('multiple', this._multiple);
  
    // taglist should not be in DOM if multiple === false
    if (!this._multiple) {
      this.removeChild(this._elements.taglist);
    }
    else {
      this.appendChild(this._elements.taglist);
    }
    
    // we need to remove and re-add the native select to loose the selection
    if (this._nativeInput) {
      this.removeChild(this._elements.nativeSelect);
    }
    this._elements.nativeSelect.multiple = this._multiple;
    this._elements.nativeSelect.selectedIndex = -1;
    
    if (this._nativeInput) {
      if (this._multiple) {
        // We might not be rendered yet
        if (this._elements.nativeSelect.parentNode) {
          this.insertBefore(this._elements.nativeSelect, this._elements.taglist);
        }
      }
      else {
        this.appendChild(this._elements.nativeSelect);
      }
    }
    
    this._elements.list.multiple = value;
    
    // sets the correct name for value submission
    this._setName(this.name);
    
    // we need to make sure the selection is valid
    this._setStateFromDOM();
    
    // everytime multiple changes, the state of the selectlist and taglist need to be updated
    this.items.getAll().forEach(function(item) {
      if (this._multiple && item.hasAttribute('selected')) {
        if (item._selectListItem) {
          item._selectListItem.setAttribute('hidden', '');
        }
        this._addTagToTagList(item);
      }
      else {
        if (item._selectListItem) {
          item._selectListItem.removeAttribute('hidden');
        }
        // taglist is never used for multiple = false
        this._removeTagFromTagList(item);
        
        // when multiple = false and the item is selected, the value needs to be updated in the input
        if (item.hasAttribute('selected')) {
          this._elements.input.value = itemValueFromDOM(item);
        }
      }
    }, this);
  }
  
  /**
   Contains a hint to the user of what can be selected in the component. If no placeholder is provided, the first
   option will be displayed in the component.
   
   @type {String}
   @default ""
   @htmlattribute placeholder
   @htmlattributereflected
   @memberof Coral.Select#
   */
  // p = placeholder, m = multiple, se = selected
  // case 1:  p +  m +  se = p
  // case 2:  p +  m + !se = p
  // case 3: !p + !m +  se = se
  // case 4: !p + !m + !se = firstSelectable (native behavior)
  // case 5:  p + !m +  se = se
  // case 6:  p + !m + !se = p
  // case 7: !p +  m +  se = 'Select'
  // case 8: !p +  m + !se = 'Select'
  get placeholder() {
    return this._placeholder || '';
  }
  set placeholder(value) {
    this._placeholder = transform.string(value);
    this._reflectAttribute('placeholder', this._placeholder);
    
    // case 1:  p +  m +  se = p
    // case 2:  p +  m + !se = p
    // case 6:  p + !m + !se = p
    if (this._placeholder && (this.hasAttribute('multiple') || !this.selectedItem)) {
      this._elements.button.classList.add('is-placeholder');
      this._elements.label.textContent = this._placeholder;
    }
    // case 7: !p +  m +  se = 'Select'
    // case 8: !p +  m + !se = 'Select'
    else if (this.hasAttribute('multiple')) {
      this._elements.button.classList.add('is-placeholder');
      this._elements.label.textContent = i18n.get('Select');
    }
    // case 4: !p + !m + !se = firstSelectable (native behavior)
    else if (!this.selectedItem) {
      // we clean the value because there is no selected item
      this._elements.input.value = '';
      
      // gets the first candidate for selection
      const placeholderItem = this.items._getFirstSelectable();
      this._elements.button.classList.remove('is-placeholder');
      
      if (placeholderItem) {
        // selects using the attribute in case the item is not yet initialized
        placeholderItem.setAttribute('selected', '');
        this._elements.label.innerHTML = placeholderItem.innerHTML;
      }
      else {
        // label must be cleared when there is no placeholder and no item to select
        this._elements.label.textContent = '';
      }
    }
  }
  
  // JSDocs inherited
  get name() {
    return this.multiple ? this._elements.taglist.name : this._elements.input.name;
  }
  set name(value) {
    this._setName(value);
    this._reflectAttribute('name', this.name);
  }
  
  // JSDocs inherited
  get value() {
    // we leverage the internal elements to know the value, this way we are always sure that the server submission
    // will be correct
    return this.multiple ? this._elements.taglist.value : this._elements.input.value;
  }
  set value(value) {
    // we rely on the the values property to handle this correctly
    this.values = [value];
  }
  
  /**
   The current selected values, as submitted during form submission. When {@link Coral.Select#multiple} is
   <code>false</code>, this will be an array of length 1.
   
   @type {Array.<String>}
   @memberof Coral.Select#
   */
  get values() {
    if (this.multiple) {
      return this._elements.taglist.values;
    }
    else {
      // if there is a selection, we return whatever value it has assigned
      return this.selectedItem ? [this._elements.input.value] : [];
    }
  }
  set values(values) {
    if (Array.isArray(values)) {
      // when multiple = false, we explicitely ignore the other values and just set the first one
      if (!this.multiple && values.length > 1) {
        values = [values[0]];
      }
      
      // gets all the items
      const items = this.items.getAll();
      
      let itemValue;
      // if multiple, we need to explicitely set the selection state of every item
      if (this.multiple) {
        items.forEach(function(item) {
          // we use DOM API instead of properties in case the item is not yet initialized
          itemValue = itemValueFromDOM(item);
          // if the value is located inside the values array, then we set the item as selected
          item[values.indexOf(itemValue) !== -1 ? 'setAttribute' : 'removeAttribute']('selected', '');
        });
      }
      // if single selection, we find the first item that matches the value and deselect everything else. in case,
      // no item matches the value, we may need to find a selection candidate
      else {
        let targetItem;
        // since multiple = false, there is only 1 value value
        const value = values[0] || '';
        
        items.forEach(function(item) {
          // small optimization to avoid calculating the value from every item
          if (!targetItem) {
            itemValue = itemValueFromDOM(item);
            
            if (itemValue === value) {
              // selecting the item will cause the taglist or input to be updated
              item.setAttribute('selected', '');
              // we store the first ocurrence, afterwards we deselect all items
              targetItem = item;
              
              // since we found our target item, we continue to avoid removing the selected attribute
              return;
            }
          }
          
          // every-non targetItem must be deselected
          item.removeAttribute('selected');
        });
        
        // if no targetItem was found, _setStateFromDOM will make sure that the state is valid
        if (!targetItem) {
          this._setStateFromDOM();
        }
      }
    }
  }
  
  // JSDoc inherited
  get disabled() {
    return this._disabled || false;
  }
  set disabled(value) {
    this._disabled = transform.booleanAttr(value);
    this._reflectAttribute('disabled', this._disabled);
    
    this.setAttribute('aria-disabled', this._disabled);
    this.classList.toggle('is-disabled', this._disabled);
    
    const isReadOnly = this.hasAttribute('readonly');
    this._elements.button.disabled = this._disabled || isReadOnly;
    this._elements.input.disabled = this._disabled || isReadOnly;
    this._elements.taglist.disabled = this._disabled || isReadOnly;
  }
  
  // JSDoc inherited
  get invalid() {
    return super.invalid
  }
  set invalid(value) {
    super.invalid = value;
    
    this.classList.toggle('is-invalid', this.invalid);
  }
  
  // JSDoc inherited
  get required() {
    return this._required || false;
  }
  set required(value) {
    this._required = transform.booleanAttr(value);
    this._reflectAttribute('required', this._required);
    
    this.setAttribute('aria-required', this._required);
    this._elements.input.required = this._required;
    this._elements.taglist.required = this._required;
  }
  
  // JSDoc inherited
  get readOnly() {
    return this._readOnly || false;
  }
  set readOnly(value) {
    this._readOnly = transform.booleanAttr(value);
    this._reflectAttribute('readonly', this._readOnly);
    this.setAttribute('aria-readonly', this._readOnly);
    
    const isDisabled = this.hasAttribute('disabled');
    this._elements.button.disabled = this._readOnly || isDisabled;
    this._elements.input.readOnly = this._readOnly || isDisabled;
    this._elements.taglist.readOnly = this._readOnly || isDisabled;
    this._elements.taglist.disabled = this._readOnly || isDisabled;
  }
  
  // JSDocs inherited
  get labelledBy() {
    return super.labelledBy;
  }
  set labelledBy(value) {
    super.labelledBy = value;
  
    if (this.labelledBy) {
      this._elements.nativeSelect.setAttribute('aria-labelledby', this.labelledBy);
    }
    else {
      this._elements.nativeSelect.removeAttribute('aria-labelledby');
    }
    
    this._elements.taglist.labelledBy = this.labelledBy;
  }
  
  /**
   Returns the first selected item in the Select. The value <code>null</code> is returned if no element is
   selected.
   
   @type {?HTMLElement}
   @readonly
   @memberof Coral.Select#
   */
  get selectedItem() {
    return this.hasAttribute('multiple') ? this.items._getFirstSelected() : this.items._getLastSelected();
  }
  
  /**
   Returns an Array containing the set selected items.
   
   @type {Array.<HTMLElement>}
   @readonly
   @memberof Coral.Select#
   */
  get selectedItems() {
    if (this.hasAttribute('multiple')) {
      return this.items._getAllSelected();
    }
    else {
      const item = this.selectedItem;
      return item ? [item] : [];
    }
  }
  
  /**
   Indicates that the Select is currently loading remote data. This will set the wait indicator inside the list.
   
   @type {Boolean}
   @default false
   @htmlattribute loading
   @memberof Coral.Select#
   */
  get loading() {
    return this._elements.list.loading;
  }
  
  set loading(value) {
    this._elements.list.loading = value;
  }
  
  /**
   The Select's variant.
   
   @type {Coral.Select.variant}
   @default Coral.Select.variant.DEFAULT
   @htmlattribute variant
   @htmlattributereflected
   @memberof Coral.Select#
   */
  get variant() {
    return this._variant || variant.DEFAULT;
  }
  set variant(value) {
    value = transform.string(value).toLowerCase();
    this._variant = validate.enumeration(variant)(value) && value || variant.DEFAULT;
    this._reflectAttribute('variant', this._variant);
    
    // we need to handle the default value of the button because it is not 'default'. this is done in the set
    // since the button will have its own sync
    this._elements.button.variant = value === variant.DEFAULT ?
      Button.variant.DEFAULT :
      Button.variant.QUIET;
    
    this.classList.remove.apply(this.classList, ALL_VARIANT_CLASSES);
    
    if (this._variant !== variant.DEFAULT) {
      this.classList.add(`${CLASSNAME}--${this._variant}`);
    }
    
    // sets the separation of the overlay from the button based on the variant
    this._elements.overlay.offset = overlayOffset[this._variant];
  }
  
  /** @ignore */
  _setName(value) {
    if (this.multiple) {
      this._elements.input.name = '';
      this._elements.taglist.name = value;
    }
    else {
      this._elements.taglist.name = '';
      this._elements.input.name = value;
    }
  }
  
  /**
   @param {Boolean} [checkAvailableSpace=false]
   If <code>true</code>, the event is triggered based on the available space.
   
   @private
   */
  _showOptions(checkAvailableSpace) {
    if (checkAvailableSpace) {
      // threshold in pixels
      const ITEM_SIZE_THRESHOLD = 30;
      
      let scrollHeight = this._elements.list.scrollHeight;
      const viewportHeight = this._elements.list.clientHeight;
      const scrollTop = this._elements.list.scrollTop;
      // we should not do this, but it increases performance since we do not need to find the item
      const loadIndicator = this._elements.list._elements.loadIndicator;
      
      // we remove the size of the load indicator
      if (loadIndicator && loadIndicator.parentNode) {
        const outerHeight = function(el) {
          let height = el.offsetHeight;
          const style = getComputedStyle(el);
          
          height += parseInt(style.marginTop) + parseInt(style.marginBottom);
          return height;
        };
        
        scrollHeight -= outerHeight(loadIndicator);
      }
      
      // if we are not close to the bottom scroll, we cancel triggering the event
      if (scrollTop + viewportHeight < scrollHeight - ITEM_SIZE_THRESHOLD) {
        return;
      }
    }
    
    // we do not show the list with native
    if (!this._useNativeInput) {
      // Show the overlay
      this._elements.overlay.open = true;
    }
    
    // Trigger an event
    // @todo: maybe we should only trigger this event when the button is toggled and we have space for more items
    const event = this.trigger('coral-select:showitems', {
      // amount of items in the select
      start: this.items.length
    });
    
    // while using native there is no need to show the loading
    if (!this._useNativeInput) {
      // if the default is prevented, we should the loading indicator
      this._elements.list.loading = event.defaultPrevented;
    }
  }
  
  /** @private */
  _hideOptions() {
    this._elements.overlay.open = false;
    
    this.trigger('coral-select:hideitems');
  }
  
  /** @ignore */
  _onGlobalClick(event) {
    if (!this._elements.overlay.open) {
      return;
    }
  
    const eventTargetWithinOverlayTarget = this._elements.button.contains(event.target);
    const eventTargetWithinItself = this._elements.overlay.contains(event.target);
    if (!eventTargetWithinOverlayTarget && !eventTargetWithinItself) {
      this._hideOptions();
    }
  }
  
  /** @private */
  _onSelectListItemAdd(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    // When items have been added, we are no longer loading
    this.loading = false;
    
    // Reset height
    this._elements.list.style.height = '';
    
    // Measure actual height
    const style = window.getComputedStyle(this._elements.list);
    const height = parseInt(style.height, 10);
    const maxHeight = parseInt(style.maxHeight, 10);
    
    if (height < maxHeight) {
      // Make it scrollable
      this._elements.list.style.height = height - 1 + 'px';
    }
  }
  
  /** @private */
  _onInternalEvent(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
  }
  
  /** @ignore */
  _onItemAdded(item) {
    const selectListItemParent = this._elements.list;
  
    const selectListItem = item._selectListItem || new Coral.SelectList.Item();
    
    // @todo: Make sure it is added at the right index.
    selectListItemParent.appendChild(selectListItem);
    
    selectListItem.set({
      value: item.value,
      content: {
        innerHTML: item.innerHTML
      },
      disabled: item.disabled,
      selected: item.selected
    }, true);
  
    const nativeOption = item._nativeOption || new Option();
    
    // @todo: make sure it is added at the right index.
    this._elements.nativeSelect.appendChild(nativeOption);
    
    // Need to store the initially selected values in the native select so that it can be reset
    if (this._initialValues.indexOf(item.value) !== -1) {
      nativeOption.setAttribute('selected', 'selected');
    }
    
    nativeOption.selected = item.selected;
    nativeOption.value = item.value;
    nativeOption.disabled = item.disabled;
    nativeOption.innerHTML = item.innerHTML;
    
    if (this.multiple) {
      // in case it was selected before it was added
      if (item.selected) {
        selectListItem.hidden = true;
        this._addTagToTagList(item);
      }
    }
    else {
      // Make sure the input value is set to the selected item
      if (item.selected) {
        this._elements.input.value = item.value;
      }
    }
    
    item._selectListItem = selectListItem;
    item._nativeOption = nativeOption;
    
    selectListItem._selectItem = item;
    nativeOption._selectItem = item;
  }
  
  /** @private */
  _onItemRemoved(item) {
    if (item._selectListItem) {
      item._selectListItem.remove();
      item._selectListItem._selectItem = undefined;
      item._selectListItem = undefined;
    }
    
    if (item._nativeOption) {
      this._elements.nativeSelect.removeChild(item._nativeOption);
      item._nativeOption._selectItem = undefined;
      item._nativeOption = undefined;
    }
    
    this._removeTagFromTagList(item, true);
  }
  
  /** @private */
  _onItemSelected(item) {
    // in case the component is not in the DOM or the internals have not been created we force it
    if (!item._selectListItem || !item._selectListItem.parentNode) {
      this._onItemAdded(item);
    }
    
    item._selectListItem.selected = true;
    item._nativeOption.selected = true;
    
    if (this.multiple) {
      this._addTagToTagList(item);
      // we need to hide the item from further selections
      // @todo: what happens when ALL items have been selected
      //  1. a message is disabled (i18n?)
      //  2. we don't try to open the selectlist (native behavior).
      item._selectListItem.hidden = true;
    }
    else {
      this._elements.input.value = item.value;
    }
  }
  
  /** @private */
  _onItemDeselected(item) {
    // in case the component is not in the DOM or the internals have not been created we force it
    if (!item._selectListItem || !item._selectListItem.parentNode) {
      this._onItemAdded(item);
    }
    
    item._selectListItem.selected = false;
    item._nativeOption.selected = false;
    
    // the hidden items need to be reinstated
    if (this.multiple) {
      // we use the internal reference to remove the related tag from the taglist
      this._removeTagFromTagList(item);
      item._selectListItem.hidden = false;
    }
  }
  
  /**
   Detects when something is about to change inside the select.
   
   @private
   */
  _onSelectListBeforeChange(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    // We prevent the selection to change if we're in single selection and the clicked item is already selected
    if (!this.multiple && event.detail.item.selected) {
      event.preventDefault();
      this._elements.overlay.open = false;
    }
  }
  
  /**
   Detects when something inside the select list changes.
   
   @private
   */
  _onSelectListChange(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    // avoids triggering unnecessary changes in the selectist because selecting items programatically will trigger
    // a change event
    if (this._bulkSelectionChange) {
      return;
    }
    
    let oldSelection = event.detail.oldSelection || [];
    oldSelection = !Array.isArray(oldSelection) ? [oldSelection] : oldSelection;
  
    let selection = event.detail.selection || [];
    selection = !Array.isArray(selection) ? [selection] : selection;
    
    // if the arrays are the same, there is no point in calculating the selection changes
    if (event.detail.oldSelection !== event.detail.selection) {
      this._bulkSelectionChange = true;
      
      // we deselect first the ones that have to go
      const diff = arrayDiff(oldSelection, selection);
      diff.forEach(function(listItem) {
        // selectlist will report on removed items
        if (listItem._selectItem) {
          listItem._selectItem.removeAttribute('selected');
        }
      });
      
      // we only sync the items that changed
      const newSelection = arrayDiff(selection, oldSelection);
      newSelection.forEach(function(listItem) {
        if (listItem._selectItem) {
          listItem._selectItem.setAttribute('selected', '');
        }
      });
      
      this._bulkSelectionChange = false;
      
      // hides the list since something was selected. if the overlay was open, it means there was user interaction so
      // the necessary events need to be triggered
      if (this._elements.overlay.open) {
        // closes and triggers the hideitems event
        this._hideOptions();
        
        // if there is a change in the selection, we trigger a change event
        if (newSelection.length) {
          this.trigger('change');
        }
      }
    }
    // in case they are the same, we just need to trigger the hideitems event when appropiate, and that is when the
    // overlay was previously open
    else if (this._elements.overlay.open) {
      // closes and triggers the hideitems event
      this._hideOptions();
    }
  }
  
  /** @private */
  _onTagListChange(event) {
    // cancels the change event from the taglist
    event.stopImmediatePropagation();
    
    // avoids triggering unnecessary changes in the selectist because selecting items programatically will trigger
    // a change event
    if (this._bulkSelectionChange) {
      return;
    }
    
    this._bulkSelectionChange = true;
  
    const values = event.target.values;
    // we use the selected items, because they are the only possible items that may change
    let itemValue;
    this.items._getAllSelected().forEach(function(item) {
      // we use DOM API instead of properties in case the item is not yet initialized
      itemValue = itemValueFromDOM(item);
      // if the item is inside the values array, then it has to be selected
      item[values.indexOf(itemValue) !== -1 ? 'setAttribute' : 'removeAttribute']('selected', '');
    });
    
    this._bulkSelectionChange = false;
    
    // if the taglist is empty, we should return the focus to the button
    if (!values.length) {
      this._elements.button.focus();
    }
    
    // reparents the change event with the select as the target
    this.trigger('change');
  }
  
  /** @private */
  _addTagToTagList(item) {
    // we prepare the tag
    item._tag = item._tag || new Coral.Tag();
    item._tag.set({
      value: item.value,
      multiline: true,
      label: {
        innerHTML: item.innerHTML
      }
    }, true);
    
    // we add the new tag at the end
    this._elements.taglist.items.add(item._tag);
  }
  
  /** @private */
  _removeTagFromTagList(item, destroy) {
    if (item._tag) {
      item._tag.remove();
      // we only remove the reference if destroy is passed, this allow us to recycle the tags when possible
      item._tag = destroy ? undefined : item._tag;
    }
  }
  
  /** @private */
  _onSelectListScrollBottom(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    if (this._elements.overlay.open) {
      // Checking if the overlay is open guards against debounced scroll events being handled after an overlay has
      // already been closed (e.g. clicking the last element in a selectlist always reopened the overlay emediately
      // after closing)
      
      // triggers the corresponding event
      // since we got the the event from select list we need to trigger the event
      this._showOptions();
    }
  }
  
  /** @private */
  _onButtonClick(event) {
    event.preventDefault();
    
    if (this.disabled) {
      return;
    }
    
    // if native is required, we do not need to do anything
    if (!this._useNativeInput) {
      // @todo: this was removed cause otherwise the coral-select:showitems event is never triggered.
      // if this is a multiselect and all items are selected, there should be nothing in the list to focus so do
      // nothing.
      // if (this.multiple && this.selectedItems.length === this.items.length) {
      //   return;
      // }
      
      // Toggle openness
      if (this._elements.overlay.open) {
        this._hideOptions();
      }
      else {
        // event should be triggered based on the contents
        this._showOptions(true);
      }
    }
  }
  
  /** @private */
  _onNativeSelectClick(event) {
    this._showOptions(false);
  }
  
  /** @private */
  _onSpaceKey(event) {
    if (this.disabled) {
      return;
    }
    
    event.preventDefault();
    
    if (this._useNativeInput) {
      // we try to open the native select
      this._elements.nativeSelect.dispatchEvent(new MouseEvent('mousedown'));
    }
    else {
      if (!this._elements.overlay.open || event.keyCode === Coral.Keys.keyToCode('space')) {
        this._elements.button.click();
      }
    }
  }
  
  /**
   Prevents tab key default handling on selectList Items.
   
   @private
   */
  _onTabKey(event) {
    event.preventDefault();
  }
  
  /** @private */
  _onOverlayToggle(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    this._elements.button.classList.toggle('is-selected', event.target.open);
    
    // @a11y
    this._elements.button.setAttribute('aria-expanded', event.target.open);
    
    if (!event.target.open) {
      this.classList.remove.apply(this.classList, ['is-openAbove', 'is-openBelow']);
    }
  
    // handles the focus allocation every time the overlay closes
    this._elements.overlay.returnFocusTo(this._elements.button);
  }
  
  /** @private */
  _onOverlayPositioned(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    this.classList.add(event.detail.vertical === 'top' ? 'is-openBelow' : 'is-openAbove');
    this._elements.overlay.style.minWidth = this.offsetWidth + 'px';
  }
  
  // @todo: while the select is multiple, if everything is deselected no change event will be triggered.
  _onNativeSelectChange(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    // avoids triggering unnecessary changes in the selectist because selecting items programatically will trigger
    // a change event
    if (this._bulkSelectionChange) {
      return;
    }
    
    this._bulkSelectionChange = true;
    // extracts the native options for the selected items. We use the selected options, instead of the complete
    // options to make the diff since it will normally be a smaller set
    const oldSelectedOptions = this.selectedItems.map(function(element) {
      return element._nativeOption;
    });
    
    // we convert the HTMLCollection to an array
    const selectedOptions = Array.prototype.slice.call(event.target.querySelectorAll(':checked'));
    
    const diff = arrayDiff(oldSelectedOptions, selectedOptions);
    diff.forEach(function(item) {
      item._selectItem.selected = false;
    });
    
    // we only sync the items that changed
    const newSelection = arrayDiff(selectedOptions, oldSelectedOptions);
    newSelection.forEach(function(item) {
      item._selectItem.selected = true;
    });
    
    this._bulkSelectionChange = false;
    
    // since multiple keeps the select open, we cannot return the focus to the button otherwise the user cannot
    // continue selecting values
    if (!this.multiple) {
      // returns the focus to the button, otherwise the select will keep it
      this._elements.button.focus();
      // since selecting an item closes the native select, we need to trigger an event
      this.trigger('coral-select:hideitems');
    }
    
    // if the native change event was triggered, then it means there is some new value
    this.trigger('change');
  }
  
  /**
   This handles content change of coral-select-item and updates its associatives.
   
   @private
   */
  _onItemContentChange(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    const item = event.target;
    if (item._selectListItem && item._selectListItem.content) {
      item._selectListItem.content.innerHTML = item.innerHTML;
    }
    
    if (item._nativeOption) {
      item._nativeOption.innerHTML = item.innerHTML;
    }
    
    if (item._tag && item._tag.label) {
      item._tag.label.innerHTML = item.innerHTML;
    }
    
    // since the content changed, we need to sync the placeholder in case it was the selected item
    this._syncSelectedItemPlaceholder();
  }
  
  /** @private */
  _syncSelectedItemPlaceholder() {
    this.placeholder = this.getAttribute('placeholder');
    
    // case 3: !p + !m +  se = se
    // case 5:  p + !m +  se = se
    if (this.selectedItem && !this.multiple) {
      this._elements.button.classList.remove('is-placeholder');
      this._elements.label.innerHTML = this.selectedItem.innerHTML;
    }
  }
  
  /**
   This handles value change of coral-select-item and updates its associatives.
   
   @private
   */
  _onItemValueChange(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    const item = event.target;
    if (item._selectListItem) {
      item._selectListItem.value = item.value;
    }
    
    if (item._nativeOption) {
      item._nativeOption.value = item.value;
    }
    
    if (item._tag) {
      item._tag.value = item.value;
    }
  }
  
  /**
   This handles disabled change of coral-select-item and updates its associatives.
   
   @private
   */
  _onItemDisabledChange(event) {
    // stops propagation cause the event is internal to the component
    event.stopImmediatePropagation();
    
    const item = event.target;
    if (item._selectListItem) {
      item._selectListItem.disabled = item.disabled;
    }
    
    if (item._nativeOption) {
      item._nativeOption.disabled = item.disabled;
    }
  }
  
  /**
   In case an item from the initial selection is removed, we need to remove it from the initial values.
   
   @private
   */
  _validateInitialState(nodes) {
    let item;
    let value;
    let index;
    
    // we iterate over all the nodes, checking if they matched the initial value
    for (let i = 0, nodeCount = nodes.length; i < nodeCount; i++) {
      // since we are not sure if the item has been upgraded, we try first the attribute, otherwise we extract the
      // value from the textContent
      item = nodes[i];
      
      value = itemValueFromDOM(item);
      index = this._initialValues.indexOf(item.value);
      
      if (index !== -1) {
        this._initialValues.splice(index, 1);
      }
    }
  }
  
  /** @private */
  _onCollectionChange(addedNodes, removedNodes) {
    // we make sure that items that were part of the initial selection are removed from the internal representation
    this._validateInitialState(removedNodes);
    // makes sure that the selection state matches the multiple variable
    this._setStateFromDOM();
  }
  
  /**
   Updates the label to reflect the current state. The label needs to be updated when the placeholder changes and
   when the selection changes.
   
   @private
   */
  _updateLabel() {
    this._syncSelectedItemPlaceholder();
  }
  
  /**
   Handles the selection state.
   
   @ignore
   */
  _setStateFromDOM() {
    // if it is not multiple, we need to be sure only one item is selected
    if (!this.hasAttribute('multiple')) {
      // makes sure that only one is selected
      this.items._deselectAllExceptLast();
      
      // we execute _getFirstSelected instead of _getSelected because it is faster
      const selectedItem = this.items._getFirstSelected();
      
      // case 1. there is a selected item, so no further change is required
      // case 2. no selected item and no placeholder. an item will be automatically selected
      // case 3. no selected item and a placehoder. we just make sure the value is really empty
      if (!selectedItem) {
        // we clean the value because there is no selected item
        this._elements.input.value = '';
        
        // when there is no placeholder, we need to force a selection to behave like the native select
        if (transform.string(this.getAttribute('placeholder')) === '') {
          // gets the first candidate for selection
          const selectable = this.items._getFirstSelectable();
          
          if (selectable) {
            // selects using the attribute in case the item is not yet initialized
            selectable.setAttribute('selected', '');
            // we set the value explicitely, so we do not need to wait for the MO
            this._elements.input.value = itemValueFromDOM(selectable);
          }
        }
      }
      else {
        // we set the value explicitely, so we do not need to wait for the MO
        this._elements.input.value = itemValueFromDOM(selectedItem);
      }
    }
    
    // handles the initial item in the select
    this._updateLabel();
  }
  
  /**
   Handles selecting multiple items. Selection could result a single or multiple selected items.
   
   @private
   */
  _onItemSelectedChange(event) {
    // we stop propagation since it is a private event
    event.stopImmediatePropagation();
    
    // the item that was selected
    const item = event.target;
    
    // setting this to true will ignore any changes from the selectlist al
    this._bulkSelectionChange = true;
    
    // when the item is selected, we need to enforce the selection mode
    if (item.selected) {
      this._onItemSelected(item);
      
      // enforces the selection mode
      if (!this.hasAttribute('multiple')) {
        this.items._deselectAllExcept(item);
      }
    }
    else {
      this._onItemDeselected(item);
    }
    
    this._bulkSelectionChange = false;
    
    // since there is a change in selection, we need to update the placeholder
    this._updateLabel();
  }
  
  // JSDocs inherited from coralui-mixin-formfield
  clear() {
    this.value = '';
  }
  
  /**
   Focuses the component.
   
   @ignore
   */
  focus() {
    if (!this.contains(document.activeElement)) {
      this._elements.button.focus();
    }
  }
  
  // JSDocs inherited from coralui-mixin-formfield
  reset() {
    // reset the values to the initial values
    this.values = this._initialValues;
  }
  
  // Expose enums
  static get variant() {return variant;}
  
  static get observedAttributes() {
    return super.observedAttributes.concat(['variant', 'multiple', 'placeholder', 'loading']);
  }
  
  connectedCallback() {
    super.connectedCallback();
    
    this.classList.add(CLASSNAME);
  
    // Default reflected attributes
    if (!this._variant) {this.variant = variant.DEFAULT;}
    
    this.classList.toggle('coral3-Select--native', this._useNativeInput);
  
    if (!this._useNativeInput && this.contains(this._elements.nativeSelect)) {
      this.removeChild(this._elements.nativeSelect);
    }
    
    // handles the initial selection
    this._setStateFromDOM();
    
    // we need to keep a state of the initial items to be able to reset the component. values is not reliable during
    // initialization since items are not yet initialized
    this.selectedItems.forEach(function(item) {
      // we use DOM API instead of properties in case the item is not yet initialized
      this._initialValues.push(itemValueFromDOM(item));
    }, this);
  
    // Cleanup template elements (supporting cloneNode)
    const templateElements = this.querySelectorAll('[handle]');
    for (let i = 0; i < templateElements.length; ++i) {
      const currentElement = templateElements[i];
      if (currentElement.parentNode === this) {
        this.removeChild(currentElement);
      }
    }
  
    // Render the main template
    const frag = document.createDocumentFragment();
    frag.appendChild(this._elements.button);
    frag.appendChild(this._elements.input);
    frag.appendChild(this._elements.nativeSelect);
    frag.appendChild(this._elements.taglist);
    frag.appendChild(this._elements.overlay);
    
    this.insertBefore(frag, this.firstChild);
  }
  
  /**
   Triggered when the select could accept external data to be loaded by the user. If <code>preventDefault()</code> is
   called, then a loading indicator will be shown. {@link Coral.Select#loading} should be set to false to indicate
   that the data has been successfully loaded.
   
   @event Coral.Select#coral-select:showitems
   
   @param {Object} event
   Event object.
   @param {Object} event.detail
   Detail object.
   @param {Number} event.detail.start
   The count of existing items, which is the index where new items should start.
   */
  
  /**
   Triggered when the select hides the UI used to select items. This is typipically used to cancel a load request
   because the items will not be shown anymore.
   
   @event Coral.Select#coral-select:hideitems
   @param {Object} event
   Event object.
   */
}

export default Select;