const axios = require('axios');
const crypto = require('crypto');
const { Payment, Vote, Election, User, AuditLog } = require('../models');
const { getClientIP, emitVoteUpdate } = require('../utils');

// Paystack configuration
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_secret_key';
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_your_public_key';
const PAYSTACK_BASE_URL = 'https://api.paystack.co';

// Initialize payment for a vote
const initializePayment = async (req, res) => {
  try {
    const { electionId, categoryId, candidateId } = req.body;

    if (!electionId || !categoryId || !candidateId) {
      return res.status(400).json({
        success: false,
        message: 'Election ID, category ID, and candidate ID are required',
      });
    }

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured',
      });
    }

    // Verify election exists and is active
    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    if (election.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'Election is not currently active',
      });
    }

    // Check if user has already voted in this category
    const existingVote = await Vote.findOne({
      election: electionId,
      voter: req.user._id,
      category: categoryId,
    });

    if (existingVote) {
      return res.status(400).json({
        success: false,
        message: 'You have already voted in this category',
      });
    }

    // Verify candidate exists in the category
    const category = election.categories.id(categoryId);
    if (!category) {
      return res.status(404).json({
        success: false,
        message: 'Category not found',
      });
    }

    if (!category.nominees.includes(candidateId)) {
      return res.status(400).json({
        success: false,
        message: 'Candidate not found in this category',
      });
    }

    // Generate unique reference
    const reference = `VOTE_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create payment record
    const payment = await Payment.create({
      election: electionId,
      voter: req.user._id,
      amount: 1.00,
      currency: 'GHC',
      paystackReference: reference,
      status: 'pending',
      metadata: {
        categoryId,
        candidateId,
      },
    });

    // Initialize Paystack payment
    const response = await axios.post(`${PAYSTACK_BASE_URL}/transaction/initialize`, {
      amount: 100, // Amount in pesewas (1.00 GHC = 100 pesewas)
      email: req.user.email,
      reference: reference,
      callback_url: `${process.env.FRONTEND_URL || 'http://localhost:5000'}/vote/confirm`,
      metadata: {
        electionId,
        categoryId,
        candidateId,
        paymentId: payment._id,
      },
    }, {
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });

    const paystackData = response.data;

    if (!paystackData.status) {
      await Payment.findByIdAndUpdate(payment._id, {
        status: 'failed',
        failedAt: new Date(),
        failureReason: paystackData.message,
      });

      return res.status(400).json({
        success: false,
        message: 'Payment initialization failed',
        error: paystackData.message,
      });
    }

    // Update payment with transaction ID
    await Payment.findByIdAndUpdate(payment._id, {
      paystackTransactionId: paystackData.data.id,
    });

    await AuditLog.create({
      user: req.user._id,
      action: 'PAYMENT_INITIATED',
      targetType: 'payment',
      targetId: payment._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: {
        electionId,
        categoryId,
        candidateId,
        amount: 1.00,
        reference,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Payment initialized successfully',
      data: {
        paymentId: payment._id,
        reference: reference,
        authorizationUrl: paystackData.data.authorization_url,
        amount: 1.00,
        currency: 'GHC',
      },
    });
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Verify payment and create vote
const verifyPayment = async (req, res) => {
  try {
    const { reference } = req.params;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message: 'Payment reference is required',
      });
    }

    // Find payment record
    const payment = await Payment.findOne({ paystackReference: reference });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    // Verify with Paystack
    const response = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
      headers: {
        'Authorization': `Bearer ${PAYSTACK_SECRET_KEY}`,
      },
    });

    const paystackData = response.data;

    if (!paystackData.status || paystackData.data.status !== 'success') {
      await Payment.findByIdAndUpdate(payment._id, {
        status: 'failed',
        failedAt: new Date(),
        failureReason: paystackData.message || 'Payment verification failed',
      });

      return res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        error: paystackData.message,
      });
    }

    // Update payment status
    await Payment.findByIdAndUpdate(payment._id, {
      status: 'completed',
      completedAt: new Date(),
      paymentMethod: paystackData.data.channel,
    });

    // Create the vote
    const { electionId, categoryId, candidateId } = payment.metadata;

    const vote = await Vote.create({
      election: electionId,
      voter: payment.voter,
      category: categoryId,
      candidate: candidateId,
      hashedSelection: crypto.createHash('sha256').update(`${candidateId}_${Date.now()}`).digest('hex'),
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      payment: {
        amount: payment.amount,
        currency: payment.currency,
        paystackReference: reference,
        status: 'completed',
        paidAt: new Date(),
      },
    });

    // Update payment with vote reference
    await Payment.findByIdAndUpdate(payment._id, { vote: vote._id });

    // Update election vote counts
    const updatedElection = await Election.findByIdAndUpdate(electionId, {
      $inc: { totalVotes: 1, uniqueVoters: 1 },
    }, { new: true });

    // Broadcast vote update via Socket.io
    emitVoteUpdate(electionId, {
      electionId,
      candidateId,
      categoryId,
      totalVotes: updatedElection.totalVotes,
      uniqueVoters: updatedElection.uniqueVoters,
      timestamp: new Date().toISOString(),
    });

    await AuditLog.create({
      user: payment.voter,
      action: 'VOTE_CAST',
      targetType: 'vote',
      targetId: vote._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: {
        electionId,
        categoryId,
        candidateId,
        paymentId: payment._id,
        amount: payment.amount,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Vote cast successfully',
      data: {
        voteId: vote._id,
        confirmationCode: vote.confirmationCode,
        paymentStatus: 'completed',
      },
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get payment status
const getPaymentStatus = async (req, res) => {
  try {
    const { reference } = req.params;

    const payment = await Payment.findOne({ paystackReference: reference })
      .populate('election', 'title')
      .populate('voter', 'name email');

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: 'Payment not found',
      });
    }

    // Check if user owns this payment
    if (payment.voter._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        paymentId: payment._id,
        reference: payment.paystackReference,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        createdAt: payment.createdAt,
        election: payment.election,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get user's payments
const getUserPayments = async (req, res) => {
  try {
    const payments = await Payment.find({ voter: req.user._id })
      .populate('election', 'title status')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: payments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Legacy election activation payment (keeping for backward compatibility)
const initializeElectionPayment = async (req, res) => {
  try {
    const { electionId, email, amount, callback_url } = req.body;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured',
      });
    }

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Convert amount to kobo (Paystack uses kobo - 100 kobo = 1 Naira/GHS/etc)
    const amountInKobo = Math.round(amount * 100);

    const response = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount: amountInKobo,
        callback_url,
        metadata: {
          electionId: electionId.toString(),
          userId: req.user._id.toString(),
          custom_fields: [
            {
              display_name: 'Election Title',
              variable_name: 'election_title',
              value: election.title,
            },
            {
              display_name: 'Payment Type',
              variable_name: 'payment_type',
              value: 'election_activation',
            },
          ],
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.status) {
      // Update election with payment reference
      election.paystackReference = response.data.data.reference;
      election.paymentStatus = 'pending';
      await election.save();

      await AuditLog.create({
        user: req.user._id,
        action: 'PAYMENT_INITIATED',
        targetType: 'election',
        targetId: electionId,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        details: {
          reference: response.data.data.reference,
          amount,
          email,
        },
      });

      res.status(200).json({
        success: true,
        message: 'Payment initialized successfully',
        data: {
          authorization_url: response.data.data.authorization_url,
          reference: response.data.data.reference,
          access_code: response.data.data.access_code,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Failed to initialize payment',
      });
    }
  } catch (error) {
    console.error('Paystack initialization error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Payment initialization failed',
    });
  }
};

// Verify Paystack transaction for election activation
const verifyElectionPayment = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Payment gateway not configured',
      });
    }

    const response = await axios.get(
      `${PAYSTACK_BASE_URL}/transaction/verify/${reference}`,
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        },
      }
    );

    if (response.data.status && response.data.data.status === 'success') {
      const { metadata, amount, id: transactionId } = response.data.data;
      const electionId = metadata?.electionId;

      if (electionId) {
        const election = await Election.findById(electionId);
        if (election) {
          election.paymentStatus = 'paid';
          election.paystackTransactionId = transactionId.toString();
          election.amountPaid = amount / 100; // Convert from kobo
          await election.save();

          // Auto-activate election if payment successful
          if (election.status === 'draft') {
            election.status = 'active';
            election.activatedAt = new Date();
            await election.save();
          }
        }
      }

      await AuditLog.create({
        user: req.user?._id || metadata?.userId,
        action: 'PAYMENT_VERIFIED',
        targetType: 'election',
        targetId: electionId,
        ipAddress: getClientIP(req),
        userAgent: req.headers['user-agent'],
        details: {
          reference,
          transactionId,
          amount: amount / 100,
          status: 'success',
        },
      });

      res.status(200).json({
        success: true,
        message: 'Payment verified successfully',
        data: {
          status: 'success',
          amount: amount / 100,
          transactionId,
          reference,
        },
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment verification failed',
        data: {
          status: response.data.data?.status || 'failed',
          gateway_response: response.data.data?.gateway_response,
        },
      });
    }
  } catch (error) {
    console.error('Paystack verification error:', error.response?.data || error.message);
    res.status(500).json({
      success: false,
      message: error.response?.data?.message || 'Payment verification failed',
    });
  }
};

// Handle Paystack webhook
const handleWebhook = async (req, res) => {
  try {
    const hash = req.headers['x-paystack-signature'];
    
    // Verify webhook signature for production security
    if (hash && PAYSTACK_SECRET_KEY) {
      const body = req.rawBody || JSON.stringify(req.body);
      const computedHash = crypto
        .createHmac('sha512', PAYSTACK_SECRET_KEY)
        .update(body)
        .digest('hex');
      
      if (hash !== computedHash) {
        console.warn('Invalid webhook signature - request rejected');
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    
    const event = req.body;
    
    if (event.event === 'charge.success') {
      const { reference, metadata, amount, id: transactionId } = event.data;
      const electionId = metadata?.electionId;

      if (electionId) {
        const election = await Election.findById(electionId);
        if (election) {
          election.paymentStatus = 'paid';
          election.paystackTransactionId = transactionId.toString();
          election.amountPaid = amount / 100;
          
          // Auto-activate election if payment successful
          if (election.status === 'draft') {
            election.status = 'active';
            election.activatedAt = new Date();
          }
          
          await election.save();

          await AuditLog.create({
            user: metadata?.userId,
            action: 'PAYMENT_WEBHOOK_SUCCESS',
            targetType: 'election',
            targetId: electionId,
            details: {
              reference,
              transactionId,
              amount: amount / 100,
            },
          });

          console.log(`✅ Payment verified via webhook for election ${electionId}`);
        }
      }
    } else if (event.event === 'charge.failed') {
      const { reference, metadata } = event.data;
      const electionId = metadata?.electionId;

      if (electionId) {
        const election = await Election.findById(electionId);
        if (election) {
          election.paymentStatus = 'failed';
          await election.save();

          await AuditLog.create({
            user: metadata?.userId,
            action: 'PAYMENT_WEBHOOK_FAILED',
            targetType: 'election',
            targetId: electionId,
            details: {
              reference,
              reason: event.data.gateway_response,
            },
          });

          console.log(`❌ Payment failed for election ${electionId}`);
        }
      }
    }

    // Always return 200 to Paystack to acknowledge receipt
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    // Still return 200 to prevent retries
    res.status(200).send('OK');
  }
};

// Get election activation payment status
const getElectionPaymentStatus = async (req, res) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId)
      .select('paymentStatus paystackReference paystackTransactionId amountPaid status');

    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    res.status(200).json({
      success: true,
      data: {
        paymentStatus: election.paymentStatus,
        reference: election.paystackReference,
        transactionId: election.paystackTransactionId,
        amountPaid: election.amountPaid,
        electionStatus: election.status,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  initializePayment,
  verifyPayment,
  handleWebhook,
  getPaymentStatus,
  getUserPayments,
  initializeElectionPayment,
  verifyElectionPayment,
  getElectionPaymentStatus,
};
