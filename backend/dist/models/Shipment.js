"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Shipment = void 0;
const mongoose_1 = __importStar(require("mongoose"));
const crypto_1 = __importDefault(require("crypto"));
const AddressSchema = new mongoose_1.Schema({
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    zip: { type: String, required: true },
    country: { type: String, required: true },
}, { _id: false });
const ShipmentSchema = new mongoose_1.Schema({
    order_id: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    driver_id: { type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Driver', default: null },
    status: {
        type: String,
        enum: ['pending', 'assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed'],
        default: 'pending',
    },
    // Unique tracking code: generated on creation
    trackingCode: {
        type: String,
        unique: true,
        default: () => 'TRK' + crypto_1.default.randomBytes(4).toString('hex').toUpperCase(),
    },
    // 6-digit OTP — driver submits at delivery to confirm
    otp: {
        type: String,
        default: () => Math.floor(100000 + Math.random() * 900000).toString(),
    },
    estimatedDelivery: { type: Date },
    assignedAt: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    failureReason: { type: String },
    rejectedBy: [{ type: mongoose_1.default.Schema.Types.ObjectId, ref: 'Driver' }],
    paypalTrackingSynced: { type: Boolean, default: false },
    pickupAddress: { type: AddressSchema, required: true },
    deliveryAddress: { type: AddressSchema, required: true },
}, { timestamps: true });
// ── Indexes ────────────────────────────────────────────────────────────────────
// order_id and trackingCode unique indexes are already created by { unique: true } on the fields above
ShipmentSchema.index({ driver_id: 1 });
ShipmentSchema.index({ status: 1 });
exports.Shipment = mongoose_1.default.model('Shipment', ShipmentSchema);
//# sourceMappingURL=Shipment.js.map