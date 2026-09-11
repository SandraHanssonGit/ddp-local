/**
 * Product Type Configuration Service
 *
 * Manages flexible size systems for different product types:
 * - jeans_adult: Adult jeans with Length × Waist (e.g., L30-W24)
 * - tshirt: T-shirts with Size and Variant/Color (e.g., M, B01-Red)
 * - kids: Kids products with Size and Variant (e.g., K10, B26)
 * - no_size: Products without size attributes (e.g., belts, scarves)
 *
 * Phase: 2 of 2 (Product Type Configuration)
 * Status: Production-ready
 */

class ProductTypeConfig {
  /**
   * Product type definitions with parsing rules
   */
  static PRODUCT_TYPES = {
    /**
     * Adult Jeans: Length × Waist format
     * Examples: "112327-L30-W24", "114519-L32-W28"
     * Combinations: 4 lengths × 15+ waists = 60+ SKUs per style
     */
    jeans_adult: {
      id: 'jeans_adult',
      name: 'Adult Jeans',
      description: 'Jeans with length and waist sizing',
      size_format: 'length_x_waist',
      size_components: ['length', 'waist'],
      // Pattern: style_number-L##-W##
      item_pattern: /^(\d+)-L(\d+)-W(\d+)$/,
      display_template: 'L{length}-W{waist}',

      /**
       * Parse item number into components
       * @param {string} itemNumber - Item number (e.g., "112327-L30-W24")
       * @returns {Object} Parsed components or null if invalid
       */
      parse: (itemNumber) => {
        if (!itemNumber || typeof itemNumber !== 'string') return null;

        const match = itemNumber.match(/^(\d+)-L(\d+)-W(\d+)$/);
        if (!match) return null;

        return {
          style_number: match[1],
          length: match[2],
          waist: match[3],
          size_value_1: match[2], // length
          size_value_2: match[3], // waist
          size_value_3: null,
          display: `L${match[2]}-W${match[3]}`,
        };
      },
    },

    /**
     * T-Shirts: Size and Variant/Color
     * Examples: "131274-B01-003", "140009-B25-005"
     * Components: Style-VariantCode-SizeCode
     * Size codes: 001=XS, 002=S, 003=M, 004=L, 005=XL
     * Variant codes: B01, B02, etc. (representing colors or variants)
     */
    tshirt: {
      id: 'tshirt',
      name: 'T-Shirt',
      description: 'T-shirts with size and color/variant',
      size_format: 'size_and_variant',
      size_components: ['size', 'variant'],
      // Pattern: style_number-BXX-###
      item_pattern: /^(\d+)-([A-Z]\d{2})-(\d{3})$/,
      display_template: '{size} ({variant})',

      // Size code mapping
      size_codes: {
        '001': { code: 'XS', label: 'Extra Small' },
        '002': { code: 'S', label: 'Small' },
        '003': { code: 'M', label: 'Medium' },
        '004': { code: 'L', label: 'Large' },
        '005': { code: 'XL', label: 'Extra Large' },
      },

      /**
       * Parse item number into components
       * @param {string} itemNumber - Item number (e.g., "131274-B01-003")
       * @returns {Object} Parsed components or null if invalid
       */
      parse: (itemNumber) => {
        if (!itemNumber || typeof itemNumber !== 'string') return null;

        const match = itemNumber.match(/^(\d+)-([A-Z]\d{2})-(\d{3})$/);
        if (!match) return null;

        const sizeCode = match[3];
        const sizeInfo = this.PRODUCT_TYPES.tshirt.size_codes[sizeCode] || {
          code: sizeCode,
          label: sizeCode,
        };

        return {
          style_number: match[1],
          variant: match[2],
          size_code: sizeCode,
          size: sizeInfo.code,
          size_label: sizeInfo.label,
          size_value_1: sizeInfo.code, // size
          size_value_2: match[2], // variant
          size_value_3: null,
          display: `${sizeInfo.code} (${match[2]})`,
        };
      },
    },

    /**
     * Kids Products: Kids Size and Variant
     * Examples: "910006-B26-K10", "910007-B30-K14"
     * Components: Style-VariantCode-KidSize
     * Kid sizes: K07, K08, K10, K12, K14 (age/size in years)
     */
    kids: {
      id: 'kids',
      name: 'Kids Product',
      description: 'Kids products with size and variant',
      size_format: 'kid_size_and_variant',
      size_components: ['kid_size', 'variant'],
      // Pattern: style_number-BXX-K##
      item_pattern: /^(\d+)-([A-Z]\d{2})-K(\d{2})$/,
      display_template: 'K{kid_size} ({variant})',

      // Kid size mapping
      kid_sizes: {
        K07: { age: 7, label: 'Age 7' },
        K08: { age: 8, label: 'Age 8' },
        K10: { age: 10, label: 'Age 10' },
        K12: { age: 12, label: 'Age 12' },
        K14: { age: 14, label: 'Age 14' },
      },

      /**
       * Parse item number into components
       * @param {string} itemNumber - Item number (e.g., "910006-B26-K10")
       * @returns {Object} Parsed components or null if invalid
       */
      parse: (itemNumber) => {
        if (!itemNumber || typeof itemNumber !== 'string') return null;

        const match = itemNumber.match(/^(\d+)-([A-Z]\d{2})-K(\d{2})$/);
        if (!match) return null;

        const kidSizeNum = match[3].replace(/^0+/, '') || '0'; // Strip leading zeros
        const kidSizeKey = `K${match[3]}`;
        const kidSizeInfo = this.PRODUCT_TYPES.kids.kid_sizes[kidSizeKey] || {
          age: parseInt(kidSizeNum),
          label: `Age ${kidSizeNum}`,
        };

        return {
          style_number: match[1],
          variant: match[2],
          kid_size: kidSizeNum, // Without leading zero
          kid_size_label: kidSizeInfo.label,
          size_value_1: kidSizeNum, // Without leading zero
          size_value_2: match[2], // variant
          size_value_3: null,
          display: `K${match[3]} (${match[2]})`,
        };
      },
    },

    /**
     * No-Size Products: Variants only
     * Examples: "XXXXX-YYY", "550001-B25"
     * Used for: belts, scarves, accessories, or any product without sizing
     */
    no_size: {
      id: 'no_size',
      name: 'No-Size Product',
      description: 'Products without size attributes (one size or variant only)',
      size_format: null,
      size_components: [],
      // Pattern: style_number[-variant]
      item_pattern: /^(\d+)(?:-([A-Z0-9]+))?$/,
      display_template: 'One Size',

      /**
       * Parse item number into components
       * @param {string} itemNumber - Item number (e.g., "XXXXX" or "XXXXX-YYY")
       * @returns {Object} Parsed components or null if invalid
       */
      parse: (itemNumber) => {
        if (!itemNumber || typeof itemNumber !== 'string') return null;

        const match = itemNumber.match(/^(\d+)(?:-([A-Z0-9]+))?$/);
        if (!match) return null;

        return {
          style_number: match[1],
          variant: match[2] || null,
          size_value_1: null,
          size_value_2: null,
          size_value_3: null,
          display: 'One Size',
        };
      },
    },
  };

  /**
   * Get product type configuration by ID
   * @param {string} typeId - Product type ID (e.g., 'jeans_adult')
   * @returns {Object} Product type configuration or null if not found
   */
  static getProductType(typeId) {
    if (!typeId || typeof typeId !== 'string') {
      return null;
    }

    const config = this.PRODUCT_TYPES[typeId];
    if (!config) {
      return null;
    }

    return {
      ...config,
    };
  }

  /**
   * List all available product types
   * @returns {Array} Array of product type IDs
   */
  static listProductTypes() {
    return Object.keys(this.PRODUCT_TYPES);
  }

  /**
   * Get all product type configurations
   * @returns {Object} Map of product type configurations
   */
  static getAllProductTypes() {
    return { ...this.PRODUCT_TYPES };
  }

  /**
   * Parse an item number according to its product type
   * @param {string} itemNumber - Item number (e.g., "112327-L30-W24")
   * @param {string} productType - Product type ID (e.g., 'jeans_adult')
   * @returns {Object} Parsed components or null if parsing fails
   */
  static parseItemNumber(itemNumber, productType) {
    if (!itemNumber || !productType) {
      return null;
    }

    const config = this.PRODUCT_TYPES[productType];
    if (!config || !config.parse) {
      return null;
    }

    const parsed = config.parse(itemNumber);
    if (!parsed) {
      return null;
    }

    // Add metadata
    return {
      ...parsed,
      product_type: productType,
      item_number: itemNumber,
      is_valid: true,
    };
  }

  /**
   * Detect product type from item number (best guess)
   * Tries to match against known patterns
   * @param {string} itemNumber - Item number to detect
   * @returns {Object} Object with detected type and confidence
   */
  static detectProductType(itemNumber) {
    if (!itemNumber || typeof itemNumber !== 'string') {
      return { type: null, confidence: 0, reason: 'Invalid item number' };
    }

    // Try each product type
    for (const [typeId, config] of Object.entries(this.PRODUCT_TYPES)) {
      if (config.item_pattern && config.item_pattern.test(itemNumber)) {
        return {
          type: typeId,
          confidence: 1.0, // Exact match
          reason: `Matches ${typeId} pattern`,
          config,
        };
      }
    }

    return {
      type: null,
      confidence: 0,
      reason: 'No matching pattern found',
    };
  }

  /**
   * Get display size for a GTIN
   * Formats size values according to product type
   * @param {Object} gtin - GTIN object with size_value_1, size_value_2, size_value_3, product_type
   * @returns {string} Formatted display string
   */
  static getDisplaySize(gtin) {
    if (!gtin) return 'Unknown';

    const { product_type, size_value_1, size_value_2, size_value_3 } = gtin;

    const config = this.PRODUCT_TYPES[product_type] || this.PRODUCT_TYPES.no_size;

    switch (product_type) {
      case 'jeans_adult':
        if (size_value_1 && size_value_2) {
          return `L${size_value_1}-W${size_value_2}`;
        }
        return 'Unknown Size';

      case 'tshirt':
        if (size_value_1 && size_value_2) {
          return `${size_value_1} (${size_value_2})`;
        }
        if (size_value_1) {
          return size_value_1;
        }
        return 'Unknown Size';

      case 'kids':
        if (size_value_1 && size_value_2) {
          return `K${size_value_1} (${size_value_2})`;
        }
        if (size_value_1) {
          return `K${size_value_1}`;
        }
        return 'Unknown Size';

      case 'no_size':
      case 'legacy':
        if (size_value_1 && size_value_2) {
          return `${size_value_1}-${size_value_2}`;
        }
        if (size_value_1) {
          return size_value_1;
        }
        return 'One Size';

      default:
        // Fallback for unknown types
        const parts = [size_value_1, size_value_2, size_value_3].filter(Boolean);
        return parts.length > 0 ? parts.join('-') : 'Unknown';
    }
  }

  /**
   * Validate size components against product type
   * @param {Object} components - Size components object
   * @param {string} productType - Product type ID
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  static validateSize(components, productType) {
    const errors = [];

    const config = this.PRODUCT_TYPES[productType];
    if (!config) {
      return {
        valid: false,
        errors: [`Unknown product type: ${productType}`],
      };
    }

    // Validate based on product type
    switch (productType) {
      case 'jeans_adult':
        if (!components.length) {
          errors.push('Length is required for jeans');
        }
        if (!components.waist) {
          errors.push('Waist is required for jeans');
        }
        // Validate ranges
        if (components.length && (isNaN(components.length) || parseInt(components.length) < 26 || parseInt(components.length) > 38)) {
          errors.push('Length must be between 26 and 38');
        }
        if (components.waist && (isNaN(components.waist) || parseInt(components.waist) < 24 || parseInt(components.waist) > 40)) {
          errors.push('Waist must be between 24 and 40');
        }
        break;

      case 'tshirt':
        if (!components.size) {
          errors.push('Size is required for t-shirts');
        }
        if (components.size && !['XS', 'S', 'M', 'L', 'XL'].includes(components.size.toUpperCase())) {
          errors.push('Size must be one of: XS, S, M, L, XL');
        }
        // Variant is optional but if present, validate format
        if (components.variant && !/^[A-Z]\d{2}$/.test(components.variant)) {
          errors.push('Variant must be in format like B01, B02, etc.');
        }
        break;

      case 'kids':
        if (!components.kid_size) {
          errors.push('Kid size is required for kids products');
        }
        if (components.kid_size && !['7', '8', '10', '12', '14'].includes(components.kid_size.toString())) {
          errors.push('Kid size must be one of: 7, 8, 10, 12, 14');
        }
        // Variant is optional
        if (components.variant && !/^[A-Z]\d{2}$/.test(components.variant)) {
          errors.push('Variant must be in format like B26, B30, etc.');
        }
        break;

      case 'no_size':
        // No size validation needed
        break;

      case 'legacy':
        // Legacy validation is permissive
        break;

      default:
        errors.push(`Validation not implemented for ${productType}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      config,
    };
  }

  /**
   * Get size components template for a product type
   * Returns metadata about what fields are expected
   * @param {string} productType - Product type ID
   * @returns {Array} Array of component definitions
   */
  static getSizeComponentTemplate(productType) {
    const config = this.PRODUCT_TYPES[productType];
    if (!config) return [];

    switch (productType) {
      case 'jeans_adult':
        return [
          { name: 'length', label: 'Length', type: 'text', required: true, placeholder: 'e.g., 30, 32' },
          { name: 'waist', label: 'Waist', type: 'text', required: true, placeholder: 'e.g., 24, 28' },
        ];

      case 'tshirt':
        return [
          { name: 'size', label: 'Size', type: 'select', required: true, options: ['XS', 'S', 'M', 'L', 'XL'] },
          { name: 'variant', label: 'Color/Variant', type: 'text', required: false, placeholder: 'e.g., B01, B02' },
        ];

      case 'kids':
        return [
          { name: 'kid_size', label: 'Kid Size', type: 'select', required: true, options: ['7', '8', '10', '12', '14'] },
          { name: 'variant', label: 'Variant', type: 'text', required: false, placeholder: 'e.g., B26, B30' },
        ];

      case 'no_size':
        return [
          { name: 'variant', label: 'Variant (optional)', type: 'text', required: false, placeholder: 'e.g., YYY' },
        ];

      case 'legacy':
        return [
          { name: 'size', label: 'Size', type: 'text', required: false },
          { name: 'color', label: 'Color', type: 'text', required: false },
          { name: 'variant', label: 'Variant', type: 'text', required: false },
        ];

      default:
        return [];
    }
  }
}

module.exports = ProductTypeConfig;
