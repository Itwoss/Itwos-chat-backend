import Razorpay from 'razorpay';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

let razorpayInstance = null;

// Lazy initialization to ensure environment variables are loaded
const getRazorpayInstance = () => {
  if (!razorpayInstance) {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
      throw new Error('Razorpay keys are not configured. Please set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env file');
    }

    razorpayInstance = new Razorpay({
      key_id: keyId,
      key_secret: keySecret
    });
  }

  return razorpayInstance;
};

// Create Razorpay order
export const createOrder = async (amount, currency = 'INR', receipt = null) => {
  try {
    const razorpay = getRazorpayInstance();
    
    // Generate receipt if not provided (max 40 characters)
    const orderReceipt = receipt || `sub_${Date.now()}`.substring(0, 40);

    const options = {
      amount: amount * 100, // Convert to paise
      currency,
      receipt: orderReceipt,
      payment_capture: 1 // Auto capture
    };

    const order = await razorpay.orders.create(options);
    return order;
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    throw error;
  }
};

// Verify payment signature
export const verifyPaymentSignature = (orderId, paymentId, signature) => {
  try {
    const keySecret = process.env.RAZORPAY_KEY_SECRET;
    
    if (!keySecret) {
      throw new Error('RAZORPAY_KEY_SECRET is not configured');
    }

    const generatedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(orderId + '|' + paymentId)
      .digest('hex');

    return generatedSignature === signature;
  } catch (error) {
    console.error('Payment signature verification error:', error);
    return false;
  }
};

// Get payment details
export const getPaymentDetails = async (paymentId) => {
  try {
    const razorpay = getRazorpayInstance();
    const payment = await razorpay.payments.fetch(paymentId);
    return payment;
  } catch (error) {
    console.error('Error fetching payment details:', error);
    throw error;
  }
};

export default getRazorpayInstance;



