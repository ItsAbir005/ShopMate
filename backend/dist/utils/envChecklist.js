"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.printEnvChecklist = printEnvChecklist;
function printEnvChecklist() {
    const mask = (val) => {
        if (!val)
            return "MISSING";
        if (val.length <= 6)
            return "SET";
        return `${val.substring(0, 3)}***${val.substring(val.length - 2)}`;
    };
    const has = (val) => (val && val.trim().length > 0 ? "SET" : "MISSING");
    console.log("==========================================");
    console.log("      ShopMate Environment Checklist      ");
    console.log("==========================================");
    console.log(` MongoDB:     ${has(process.env.MONGO_URI)}`);
    console.log(` Redis:       ${has(process.env.REDIS_URL)}`);
    console.log(` RabbitMQ:    ${has(process.env.RABBITMQ_URL)}`);
    console.log(` Cloudinary:  ${process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET ? "SET" : "MISSING"}`);
    console.log(` PayPal:      ${process.env.PAYPAL_CLIENT_ID ? `SET (Client ID: ${mask(process.env.PAYPAL_CLIENT_ID)})` : "MISSING"}`);
    console.log(` SMTP:        ${has(process.env.SMTP_HOST || process.env.EMAIL_HOST)}`);
    console.log(` Frontend:    ${process.env.FRONTEND_URL ? "SET" : "MISSING (defaulting to localhost:3000)"}`);
    console.log("==========================================");
}
//# sourceMappingURL=envChecklist.js.map