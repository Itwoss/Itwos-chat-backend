import crypto from 'crypto';
import Payment from '../models/Payment.js';
import Subscription from '../models/Subscription.js';

// Handle Razorpay webhook events
export const handleWebhook = async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    if (!webhookSecret) {
      console.error('Razorpay webhook secret not configured');
      return res.status(500).json({ error: 'Webhook secret not configured' });
    }

    const signature = req.headers['x-razorpay-signature'];
    const body = req.body.toString();

    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(body)
      .digest('hex');

    if (signature !== expectedSignature) {
      console.error('Invalid webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(body);

    // Handle different webhook events
    switch (event.event) {
      case 'payment.captured':
        await handlePaymentCaptured(event.payload);
        break;
      case 'payment.failed':
        await handlePaymentFailed(event.payload);
        break;
      case 'order.paid':
        await handleOrderPaid(event.payload);
        break;
      default:
        console.log(`Unhandled webhook event: ${event.event}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Handle payment captured event
const handlePaymentCaptured = async (payload) => {
  try {
    const payment = payload.payment.entity;
    
    // Update payment status if exists
    await Payment.findOneAndUpdate(
      { transactionId: payment.id },
      {
        paymentStatus: 'completed',
        paymentDetails: payment
      },
      { new: true }
    );
  } catch (error) {
    console.error('Error handling payment captured:', error);
  }
};

// Handle payment failed event
const handlePaymentFailed = async (payload) => {
  try {
    const payment = payload.payment.entity;
    
    // Update payment status if exists
    await Payment.findOneAndUpdate(
      { transactionId: payment.id },
      {
        paymentStatus: 'failed',
        paymentDetails: payment
      },
      { new: true }
    );
  } catch (error) {
    console.error('Error handling payment failed:', error);
  }
};

// Handle order paid event
const handleOrderPaid = async (payload) => {
  try {
    const order = payload.order.entity;
    // Additional processing if needed
    console.log('Order paid:', order.id);
  } catch (error) {
    console.error('Error handling order paid:', error);
  }
};



