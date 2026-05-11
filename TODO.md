# TODO - PrintHub Rebuild with HTML, CSS, JS, MongoDB, Mongoose

## Phase 1: Update Dependencies
- [x] Update package.json - keep only mongoose, remove express, express-session, multer, pdf-parse

## Phase 2: Rebuild Server
- [x] Rewrite server.js with Node.js http module (no Express)
- [x] Manual routing for API endpoints
- [x] Serve static HTML/CSS/JS files

## Phase 3: Cleanup Routes
- [x] Remove routes/orders.js (routing now in server.js)

## Phase 4: Verify & Test
- [ ] Verify MongoDB connection
- [ ] Test all API endpoints
- [ ] Verify frontend functionality

## Dependencies After Rebuild:
- mongoose ^8.21.0 (only dependency)

