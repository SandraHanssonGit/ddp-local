const passportResolver = require('./passport-resolver');
const sgtinRepository = require('../repositories/sgtins');
const fieldRepository = require('../repositories/fields');
const lifecycleService = require('./lifecycle-service');

class ConsumerService {
  /**
   * Get consumer-facing passport by serial number
   * Only includes consumer_visible fields
   * Groups by category
   */
  async getConsumerPassport(serialNumber) {
    // Find SGTIN by serial number
    const sgtin = await sgtinRepository.getBySerialNumber(serialNumber);
    if (!sgtin) {
      return null;
    }

    // Resolve full passport
    const passport = await passportResolver.resolveSgtinPassport(sgtin.id);

    // Filter to only consumer-visible fields
    const consumerFields = passport.resolvedFields.filter(f => f.consumer_visible);

    // Group by category
    const groupedByCategory = {};
    for (const field of consumerFields) {
      if (!groupedByCategory[field.category]) {
        groupedByCategory[field.category] = [];
      }
      groupedByCategory[field.category].push({
        field_key: field.field_key,
        label: field.label,
        value: field.value,
        category: field.category
      });
    }

    // Get lifecycle events
    const events = await lifecycleService.getEventsForPassport(sgtin.id);

    return {
      serialNumber,
      sgtin: {
        id: passport.sgtin.id,
        serial_number: passport.sgtin.serial_number,
        sgtin: passport.sgtin.sgtin,
        rfid_id: passport.sgtin.rfid_id,
        qc_status: passport.sgtin.qc_status
      },
      gtin: {
        gtin: passport.gtin.gtin,
        size: passport.gtin.size,
        color: passport.gtin.color,
        variant: passport.gtin.variant
      },
      batch: {
        batch_id: passport.batch.batch_id,
        production_date: passport.batch.production_date,
        factory: passport.batch.factory,
        country_of_production: passport.batch.country_of_production
      },
      style: {
        style_number: passport.style.style_number,
        product_name: passport.style.product_name,
        product_type: passport.style.product_type,
        image_url: passport.style.image_url
      },
      consumerFields,
      groupedByCategory,
      fieldCount: consumerFields.length,
      events,
      eventCount: events.length
    };
  }

  /**
   * Get formatted passport by category for display
   */
  formatPassportByCategoryForDisplay(consumerPassport) {
    const categories = Object.keys(consumerPassport.groupedByCategory);

    // Define category order and metadata
    const categoryMetadata = {
      eu_required: {
        label: 'EU Digital Product Passport',
        description: 'Information required by EU regulations',
        icon: '🇪🇺',
        order: 1
      },
      nudie: {
        label: 'Nudie Jeans Story',
        description: 'Information from Nudie Jeans',
        icon: '♻️',
        order: 2
      }
    };

    // Sort categories by order
    const sortedCategories = categories.sort((a, b) => {
      const orderA = categoryMetadata[a]?.order || 999;
      const orderB = categoryMetadata[b]?.order || 999;
      return orderA - orderB;
    });

    const formatted = [];

    for (const category of sortedCategories) {
      const meta = categoryMetadata[category] || {
        label: category,
        icon: '📋',
        order: 999
      };

      formatted.push({
        category,
        ...meta,
        fields: consumerPassport.groupedByCategory[category]
      });
    }

    return formatted;
  }

  /**
   * Get QR code URL for this passport
   */
  getQrCodeUrl(serialNumber, baseUrl = 'http://localhost:3000') {
    return `${baseUrl}/dpp/${encodeURIComponent(serialNumber)}`;
  }

  /**
   * Get QR code URL by GTIN (no serial - for lazy SGTIN creation)
   */
  getQrCodeUrlByGtinOnly(gtin, baseUrl = 'http://localhost:3000') {
    return `${baseUrl}/dpp/${encodeURIComponent(gtin)}`;
  }

  /**
   * Get QR code URL by GTIN + Serial (SGTIN format)
   */
  getQrCodeUrlByGtin(gtin, serialNumber, baseUrl = 'http://localhost:3000') {
    return `${baseUrl}/dpp/${encodeURIComponent(gtin)}/${encodeURIComponent(serialNumber)}`;
  }

  /**
   * Get passport by GTIN only (no serial)
   * Shows GTIN-level data for lazy SGTIN creation pattern
   * Used when product scanned before first SGTIN assignment
   */
  async getConsumerPassportByGtinOnly(gtinNumber) {
    const gtinRepository = require('../repositories/gtins');
    const gtinRecord = await gtinRepository.getByGtin(gtinNumber);
    if (!gtinRecord) {
      return null;
    }

    // Resolve passport up to GTIN level
    const passport = await passportResolver.resolveGtinPassport(gtinRecord.id);

    // Filter to only consumer-visible fields
    const consumerFields = passport.resolvedFields.filter(f => f.consumer_visible);

    // Group by category
    const groupedByCategory = {};
    for (const field of consumerFields) {
      if (!groupedByCategory[field.category]) {
        groupedByCategory[field.category] = [];
      }
      groupedByCategory[field.category].push({
        field_key: field.field_key,
        label: field.label,
        value: field.value,
        category: field.category
      });
    }

    return {
      gtinNumber: gtinNumber,
      isGtinOnly: true,
      sgtin: null,
      gtin: {
        id: passport.gtin.id,
        gtin: passport.gtin.gtin,
        size: passport.gtin.size,
        color: passport.gtin.color,
        variant: passport.gtin.variant
      },
      batch: {
        batch_id: passport.batch.batch_id,
        production_date: passport.batch.production_date,
        factory: passport.batch.factory,
        country_of_production: passport.batch.country_of_production
      },
      style: {
        style_number: passport.style.style_number,
        product_name: passport.style.product_name,
        product_type: passport.style.product_type,
        image_url: passport.style.image_url
      },
      consumerFields,
      groupedByCategory,
      fieldCount: consumerFields.length,
      events: [],
      eventCount: 0
    };
  }

  /**
   * Get passport by GTIN + Serial (SGTIN format)
   */
  async getConsumerPassportByGtin(gtin, serialNumber) {
    const sgtin = await sgtinRepository.getByGtinAndSerial(gtin, serialNumber);
    if (!sgtin) {
      return null;
    }

    // Resolve full passport
    const passport = await passportResolver.resolveSgtinPassport(sgtin.id);

    // Filter to only consumer-visible fields
    const consumerFields = passport.resolvedFields.filter(f => f.consumer_visible);

    // Group by category
    const groupedByCategory = {};
    for (const field of consumerFields) {
      if (!groupedByCategory[field.category]) {
        groupedByCategory[field.category] = [];
      }
      groupedByCategory[field.category].push({
        field_key: field.field_key,
        label: field.label,
        value: field.value,
        category: field.category
      });
    }

    // Get lifecycle events
    const events = await lifecycleService.getEventsForPassport(sgtin.id);

    return {
      serialNumber: serialNumber,
      gtin: gtin,
      isGtinOnly: false,
      sgtin: {
        id: passport.sgtin.id,
        serial_number: passport.sgtin.serial_number,
        sgtin: passport.sgtin.sgtin,
        rfid_id: passport.sgtin.rfid_id,
        qc_status: passport.sgtin.qc_status
      },
      gtin: {
        gtin: passport.gtin.gtin,
        size: passport.gtin.size,
        color: passport.gtin.color,
        variant: passport.gtin.variant
      },
      batch: {
        batch_id: passport.batch.batch_id,
        production_date: passport.batch.production_date,
        factory: passport.batch.factory,
        country_of_production: passport.batch.country_of_production
      },
      style: {
        style_number: passport.style.style_number,
        product_name: passport.style.product_name,
        product_type: passport.style.product_type,
        image_url: passport.style.image_url
      },
      consumerFields,
      groupedByCategory,
      fieldCount: consumerFields.length,
      events,
      eventCount: events.length
    };
  }

  /**
   * Get passport data for JSON API response
   */
  async getConsumerPassportJson(serialNumber) {
    const passport = await this.getConsumerPassport(serialNumber);
    if (!passport) {
      return null;
    }

    return {
      passport,
      url: this.getQrCodeUrl(passport.serialNumber),
      formattedCategories: this.formatPassportByCategoryForDisplay(passport)
    };
  }

  /**
   * Get passport JSON by GTIN + Serial (SGTIN format)
   */
  async getConsumerPassportJsonByGtin(gtin, serialNumber) {
    const passport = await this.getConsumerPassportByGtin(gtin, serialNumber);
    if (!passport) {
      return null;
    }

    return {
      passport,
      url: this.getQrCodeUrlByGtin(gtin, serialNumber),
      formattedCategories: this.formatPassportByCategoryForDisplay(passport)
    };
  }

  /**
   * Get EU-required fields only (machine-readable JSON) by GTIN + Serial
   */
  async getEuRequiredFieldsJsonByGtin(gtin, serialNumber) {
    const passport = await this.getConsumerPassportByGtin(gtin, serialNumber);
    if (!passport) {
      return null;
    }

    // Filter to only EU-required fields
    const euFields = passport.consumerFields.filter(f => f.category === 'eu_required');

    return {
      serialNumber,
      productIdentification: {
        serialNumber: passport.sgtin.serial_number,
        sgtin: passport.sgtin.sgtin,
        gtin: passport.gtin.gtin,
        style_number: passport.style.style_number,
        batch_id: passport.batch.batch_id
      },
      productInformation: {
        name: passport.style.product_name,
        type: passport.style.product_type,
        size: passport.gtin.size,
        color: passport.gtin.color
      },
      euRequiredFields: euFields.map(f => ({
        field_key: f.field_key,
        label: f.label,
        value: f.value
      })),
      manufacturingInformation: {
        factory: passport.batch.factory,
        country_of_production: passport.batch.country_of_production,
        production_date: passport.batch.production_date
      },
      timestamp: new Date().toISOString(),
      url: this.getQrCodeUrlByGtin(gtin, serialNumber)
    };
  }

  /**
   * Get EU-required fields only (machine-readable JSON)
   */
  async getEuRequiredFieldsJson(serialNumber) {
    const passport = await this.getConsumerPassport(serialNumber);
    if (!passport) {
      return null;
    }

    // Filter to only EU-required fields
    const euFields = passport.consumerFields.filter(f => f.category === 'eu_required');

    return {
      serialNumber,
      productIdentification: {
        serialNumber: passport.sgtin.serial_number,
        sgtin: passport.sgtin.sgtin,
        gtin: passport.gtin.gtin,
        style_number: passport.style.style_number,
        batch_id: passport.batch.batch_id
      },
      productInformation: {
        name: passport.style.product_name,
        type: passport.style.product_type,
        size: passport.gtin.size,
        color: passport.gtin.color
      },
      euRequiredFields: euFields.map(f => ({
        field_key: f.field_key,
        label: f.label,
        value: f.value
      })),
      manufacturingInformation: {
        factory: passport.batch.factory,
        country_of_production: passport.batch.country_of_production,
        production_date: passport.batch.production_date
      },
      timestamp: new Date().toISOString(),
      url: this.getQrCodeUrl(serialNumber)
    };
  }
}

module.exports = new ConsumerService();
