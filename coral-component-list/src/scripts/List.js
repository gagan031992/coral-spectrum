/**
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import {ComponentMixin} from '../../../coral-mixin-component';
import {ListMixin} from '../../../coral-mixin-list';

/**
 @class Coral.List
 @classdesc A List component that supports multi-line text, icons, and text wrapping with ellipsis.
 @htmltag coral-list
 @extends {HTMLElement}
 @extends {ComponentMixin}
 @extends {ListMixin}
 */
class List extends ListMixin(ComponentMixin(HTMLElement)) {
  /** @ignore */
  constructor() {
    super();
    
    // Events
    this._delegateEvents(this._events);
  }
}

export default List;