# DPP Serial Number POC

Digital Product Passport system for managing product lifecycle from manufacturing to recycling.

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Server
```bash
npm start
```

Server runs at `http://localhost:3000`

## How It Works

### Architecture
- **Backend:** Node.js + Express
- **Database:** SQLite (local file: `database.db`)
- **Frontend:** EJS templates + Tailwind CSS

### Data Model

**Batches** → External partner creates **Serials** (with QR codes)
- As products move through supply chain → Add **Serial Data** (size, location, etc)
- When service/repair happens → Log **Events** (repairs, recycling)
- When QR code scanned → Public **Passport Page** shows all data

### Test Flow

1. **Import Batch**
   - Go to http://localhost:3000/admin
   - Fill "Import Batch + Serials" form
   - Example batch: `114539`, 5 serials: `114539-001-AA, 114539-001-AB, ...`

2. **Add Batch Data** (applies to all serials in batch)
   - Add material info, care instructions, etc
   - Example: key=`material`, value=`95% cotton, 5% elastane`

3. **Add Serial Data** (specific to one unit)
   - Add size: key=`size`, value=`M`
   - Add location: key=`location`, value=`STHLM-A12`
   - Added by: store staff name

4. **Log Event** (repair, recycling)
   - Simulate repair: type=`repaired`, details=`{"issue": "zipper", "cost": 450}`
   - Simulate recycling: type=`recycled`, details=`{"facility": "Återvinning Västra"}`

5. **View Passport** (public page)
   - Scan QR: http://localhost:3000/p/114539-001-AA
   - Shows: batch data + serial data + all events
   - Anyone can view (no login required)

## API Endpoints

### Admin API (no auth yet)

**Import batch + serials**
```bash
POST /api/batch/import
{
  "batch_id": "114539",
  "style_number": "114539",
  "total_units": 5,
  "partner_name": "Trimco",
  "serials": ["114539-001-AA", "114539-001-AB", "114539-001-AC"]
}
```

**Add data to serial**
```bash
POST /api/serials/{serial_number}/data
{
  "key": "size",
  "value": "M",
  "added_by": "sthlm-staff"
}
```

**Log event**
```bash
POST /api/serials/{serial_number}/event
{
  "event_type": "repaired",
  "event_data": {"issue": "zipper", "cost": 450}
}
```

### Public API

**Get passport**
```bash
GET /p/{serial_number}
```
Returns: HTML page with batch + serial data + events

## File Structure

```
dpp-local/
├── server.js                 # Express app entry point
├── package.json              # Dependencies
├── database.db               # SQLite (created on first run)
│
├── db/
│   └── init.js              # Database setup & queries
│
├── routes/
│   ├── api.js               # Admin API endpoints
│   └── public.js            # Public passport endpoint
│
├── views/
│   ├── admin.ejs            # Admin panel UI
│   ├── passport.ejs         # Public passport page
│   └── passport-not-found.ejs # 404 page
│
└── README.md               # This file
```

## Key Features

✅ Register serials from external partner  
✅ Flexible key-value data storage (add any field)  
✅ Batch-level data (shared by all units)  
✅ Serial-level data (specific to one unit)  
✅ Event logging (repairs, recycling, etc)  
✅ Public passport page (anyone can view)  
✅ Simple admin panel  

## Future Enhancements

- QR code generation (currently points to serial number)
- RFID support (store RFID number in serials)
- User authentication
- Search & filtering
- Export data (CSV, JSON)
- Analytics dashboard
- Mobile app

## Database Schema

### batches
```sql
id, batch_id, style_number, total_units, partner_name, created_at
```

### serials
```sql
id, batch_id, serial_number (unique), gtin, created_at
```

### serial_data
```sql
id, serial_id, key, value, added_by, added_at
```

### batch_data
```sql
id, batch_id, key, value, added_at
```

### events
```sql
id, serial_id, event_type, event_data (JSON), created_at
```

## Notes

- No authentication yet (add later)
- SQLite for local testing (migrate to PostgreSQL for production)
- QR codes point to `/p/{serial_number}` - external partner generates actual QR codes
- All timestamps in ISO 8601 format

---

**Status:** POC v1.0  
**Last Updated:** 2025-07-30
