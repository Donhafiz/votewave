const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const SALT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    /* =========================================================
       SAAS CORE: MULTI-TENANCY (CRITICAL)
    ========================================================= */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },

    /* =========================================================
       BASIC IDENTITY
    ========================================================= */
    firstName: {
      type: String,
      required: [true, "First name is required"],
      trim: true,
    },

    lastName: {
      type: String,
      required: [true, "Last name is required"],
      trim: true,
    },

    email: {
      type: String,
      required: [true, "Email is required"],
      lowercase: true,
      trim: true,
      index: true,
    },

    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 6,
      select: false,
    },

    avatar: {
      type: String,
      default: null,
    },

    /* =========================================================
       ACCESS CONTROL
    ========================================================= */
    role: {
      type: String,
      enum: ["voter", "admin", "superadmin"],
      default: "voter",
      index: true,
    },

    /* =========================================================
       ACCOUNT STATE
    ========================================================= */
    isVerified: {
      type: Boolean,
      default: false,
    },

    isBanned: {
      type: Boolean,
      default: false,
      index: true,
    },

    banReason: {
      type: String,
      default: null,
    },

    bannedAt: {
      type: Date,
      default: null,
    },

    banExpiry: {
      type: Date,
      default: null,
    },

    /* =========================================================
       SECURITY (SaaS-grade hardening)
    ========================================================= */
    loginAttempts: {
      type: Number,
      default: 0,
    },

    lockUntil: {
      type: Date,
    },

    otpCode: {
      type: String,
      select: false,
    },

    otpExpires: {
      type: Date,
      select: false,
    },

    resetPasswordToken: {
      type: String,
      select: false,
    },

    resetPasswordExpires: {
      type: Date,
      select: false,
    },

    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },

    twoFactorSecret: {
      type: String,
      select: false,
    },

    /* =========================================================
       PREFERENCES
    ========================================================= */
    notificationPreferences: {
      emailNotifications: { type: Boolean, default: true },
      electionReminders: { type: Boolean, default: true },
      resultNotifications: { type: Boolean, default: true },
    },

    lastLogin: {
      type: Date,
    },

    /* =========================================================
       IMPORTANT: AVOID SCALABILITY ISSUE
       (kept for backward compatibility, but not recommended long-term)
    ========================================================= */
    votingHistory: [
      {
        election: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Election",
        },
        votedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   INDEXING (SAAS PERFORMANCE LAYER)
========================================================= */
userSchema.index({ tenantId: 1, email: 1 }, { unique: true });
userSchema.index({ tenantId: 1, role: 1 });
userSchema.index({ tenantId: 1, isBanned: 1 });

/* =========================================================
   PASSWORD HASHING
========================================================= */
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, SALT_ROUNDS);
  next();
});

/* =========================================================
   METHODS
========================================================= */

// Password validation
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Full name helper
userSchema.methods.getFullName = function () {
  return `${this.firstName} ${this.lastName}`;
};

// Account lock check (for brute-force protection)
userSchema.methods.isLocked = function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

module.exports = mongoose.model("User", userSchema);