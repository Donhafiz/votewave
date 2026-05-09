const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

// Serialize user for session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Google OAuth Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/google/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
        let user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          // Update OAuth info if not already set
          if (!user.googleId) {
            user.googleId = profile.id;
            user.isVerified = true;
            await user.save();
          }
          return done(null, user);
        }

        // Create new user
        user = new User({
          firstName: profile.name.givenName,
          lastName: profile.name.familyName,
          email: profile.emails[0].value,
          googleId: profile.id,
          role: 'voter',
          isVerified: true,
          avatar: profile.photos[0].value
        });

        await user.save();
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  ));
}

// GitHub OAuth Strategy
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(new GitHubStrategy({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/api/auth/github/callback`
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        // Check if user already exists
        let user = await User.findOne({ email: profile.emails[0].value });

        if (user) {
          // Update OAuth info if not already set
          if (!user.githubId) {
            user.githubId = profile.id;
            user.isVerified = true;
            await user.save();
          }
          return done(null, user);
        }

        // Create new user
        user = new User({
          firstName: profile.displayName.split(' ')[0] || profile.username,
          lastName: profile.displayName.split(' ').slice(1).join(' ') || '',
          email: profile.emails[0].value,
          githubId: profile.id,
          role: 'voter',
          isVerified: true,
          avatar: profile.photos[0].value
        });

        await user.save();
        done(null, user);
      } catch (error) {
        done(error, null);
      }
    }
  ));
}

module.exports = passport;