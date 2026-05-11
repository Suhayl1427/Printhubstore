const mongoose = require('mongoose');

/**
 * Order Schema for MongoDB with Mongoose
 */
const orderSchema = new mongoose.Schema({
  trackingId: {
    type: String,
    unique: true,
    required: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  files: [{
    originalName: String,
    filename: String,
    path: String,
    size: Number,
    pages: {
      type: Number,
      default: 1
    }
  }],
  totalPages: {
    type: Number,
    default: 0
  },
  copies: {
    type: Number,
    default: 1
  },
  binding: {
    type: Boolean,
    default: false
  },
  totalPrice: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['Pending', 'Printing', 'Processing', 'Ready', 'Completed', 'Cancelled'],
    default: 'Pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Create index for faster queries
orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1 });

// Create and export the Order model
const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
