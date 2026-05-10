const passport = require("passport");

const GoogleStrategy =
  require("passport-google-oauth20").Strategy;

const GitHubStrategy =
  require("passport-github2").Strategy;

const User = require("../models/User");

/* =========================================================
   SERIALIZE USER
========================================================= */
passport.serializeUser((user, done) => {
  done(null, user.id);
});

/* =========================================================
   DESERIALIZE USER
========================================================= */
passport.deserializeUser(
  async (id, done) => {
    try {
      const user = await User.findById(id);

      done(null, user);
    } catch (error) {
      done(error, null);
    }
  }
);

/* =========================================================
   GOOGLE OAUTH STRATEGY
========================================================= */
if (
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET
) {
  passport.use(
    new GoogleStrategy(
      {
        clientID:
          process.env.GOOGLE_CLIENT_ID,

        clientSecret:
          process.env.GOOGLE_CLIENT_SECRET,

        callbackURL: `${
          process.env.BACKEND_URL ||
          "http://localhost:5000"
        }/api/auth/google/callback`,
      },

      async (
        accessToken,
        refreshToken,
        profile,
        done
      ) => {
        try {
          const email =
            profile?.emails?.[0]?.value;

          if (!email) {
            return done(
              new Error(
                "Google account email not available"
              ),
              null
            );
          }

          /* =========================
             FIND EXISTING USER
          ========================== */
          let user =
            await User.findOne({
              email,
            });

          /* =========================
             UPDATE EXISTING USER
          ========================== */
          if (user) {
            if (!user.googleId) {
              user.googleId = profile.id;

              user.isVerified = true;

              if (
                profile?.photos?.[0]?.value
              ) {
                user.avatar =
                  profile.photos[0].value;
              }

              await user.save();
            }

            return done(null, user);
          }

          /* =========================
             CREATE NEW USER
          ========================== */
          user = await User.create({
            firstName:
              profile?.name?.givenName ||
              "Google",

            lastName:
              profile?.name?.familyName ||
              "User",

            email,

            googleId: profile.id,

            role: "voter",

            isVerified: true,

            avatar:
              profile?.photos?.[0]?.value ||
              null,

            password:
              Math.random()
                .toString(36)
                .slice(-12),
          });

          return done(null, user);
        } catch (error) {
          console.error(
            "Google OAuth Error:",
            error.message
          );

          return done(error, null);
        }
      }
    )
  );

  console.log(
    "✅ Google OAuth strategy loaded"
  );
}

/* =========================================================
   GITHUB OAUTH STRATEGY
========================================================= */
if (
  process.env.GITHUB_CLIENT_ID &&
  process.env.GITHUB_CLIENT_SECRET
) {
  passport.use(
    new GitHubStrategy(
      {
        clientID:
          process.env.GITHUB_CLIENT_ID,

        clientSecret:
          process.env.GITHUB_CLIENT_SECRET,

        callbackURL: `${
          process.env.BACKEND_URL ||
          "http://localhost:5000"
        }/api/auth/github/callback`,

        scope: ["user:email"],
      },

      async (
        accessToken,
        refreshToken,
        profile,
        done
      ) => {
        try {
          const email =
            profile?.emails?.[0]?.value;

          if (!email) {
            return done(
              new Error(
                "GitHub email not available"
              ),
              null
            );
          }

          /* =========================
             FIND EXISTING USER
          ========================== */
          let user =
            await User.findOne({
              email,
            });

          /* =========================
             UPDATE EXISTING USER
          ========================== */
          if (user) {
            if (!user.githubId) {
              user.githubId = profile.id;

              user.isVerified = true;

              if (
                profile?.photos?.[0]?.value
              ) {
                user.avatar =
                  profile.photos[0].value;
              }

              await user.save();
            }

            return done(null, user);
          }

          /* =========================
             SPLIT NAME
          ========================== */
          const displayName =
            profile.displayName || "";

          const parts =
            displayName.split(" ");

          const firstName =
            parts[0] ||
            profile.username ||
            "GitHub";

          const lastName =
            parts.slice(1).join(" ") ||
            "User";

          /* =========================
             CREATE USER
          ========================== */
          user = await User.create({
            firstName,

            lastName,

            email,

            githubId: profile.id,

            role: "voter",

            isVerified: true,

            avatar:
              profile?.photos?.[0]?.value ||
              null,

            password:
              Math.random()
                .toString(36)
                .slice(-12),
          });

          return done(null, user);
        } catch (error) {
          console.error(
            "GitHub OAuth Error:",
            error.message
          );

          return done(error, null);
        }
      }
    )
  );

  console.log(
    "✅ GitHub OAuth strategy loaded"
  );
}

/* =========================================================
   EXPORT
========================================================= */
module.exports = passport;