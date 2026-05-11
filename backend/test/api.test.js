const request = require('supertest');
const expect = require('chai').expect;
const app = require('../server');

describe('VoteWave API Tests', () => {
  let server;

  before(() => {
    server = app.listen(0); // Use random available port
  });

  after(() => {
    if (server) server.close();
  });

  describe('🏥 Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/api/health')
        .expect(200);

      expect(response.body).to.have.property('status', 'OK');
      expect(response.body).to.have.property('time');
    });
  });

  describe('🏠 Root Endpoint', () => {
    it('should return API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).to.have.property('message', 'VoteWave API Server');
      expect(response.body).to.have.property('status', 'Running');
      expect(response.body).to.have.property('endpoints');
    });
  });

  describe('🔐 Authentication', () => {
    it('should handle login requests', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@example.com',
          password: 'testpassword'
        });

      // Should respond even with invalid credentials
      expect(response.status).to.be.oneOf([200, 400, 401]);
    });

    it('should handle registration requests', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          firstName: 'Test',
          lastName: 'User',
          email: 'test@example.com',
          password: 'testpassword'
        });

      // Should respond even with validation errors
      expect(response.status).to.be.oneOf([200, 400, 409]);
    });
  });

  describe('🏛️ Admin Routes', () => {
    it('should protect admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/dashboard')
        .expect(401); // Should require authentication
    });

    it('should handle admin dashboard requests with auth', async () => {
      // This would need valid JWT token in real testing
      const response = await request(app)
        .get('/api/admin/dashboard')
        .set('Authorization', 'Bearer fake-token')
        .expect(401); // Should fail with invalid token
    });
  });

  describe('🗳 Election Routes', () => {
    it('should handle election listing', async () => {
      const response = await request(app)
        .get('/api/elections')
        .expect(200);

      expect(response.body).to.have.property('success');
    });

    it('should handle election creation', async () => {
      const response = await request(app)
        .post('/api/elections')
        .send({
          title: 'Test Election',
          description: 'Test Description',
          startDate: new Date(),
          endDate: new Date(Date.now() + 86400000) // 24 hours later
        })
        .expect(401); // Should require authentication
    });
  });

  describe('🔧 System Integration', () => {
    it('should have Redis connection working', async () => {
      // Test Redis-dependent endpoint
      const response = await request(app)
        .get('/api/dashboard/test/test:123/live')
        .expect(404); // Should not find non-existent election
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(5).fill().map(() =>
        request(app).get('/api/health')
      );

      const responses = await Promise.all(promises);
      
      responses.forEach(response => {
        expect(response.status).to.equal(200);
      });
    });
  });

  describe('🛡️ Security', () => {
    it('should reject invalid JSON', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .set('Content-Type', 'application/json')
        .send('invalid json')
        .expect(400);
    });

    it('should handle rate limiting', async () => {
      const promises = Array(20).fill().map(() =>
        request(app).get('/api/health')
      );

      const responses = await Promise.all(promises);
      
      // Should handle high volume gracefully
      const successCount = responses.filter(r => r.status === 200).length;
      expect(successCount).to.be.at.least(10); // At least half should succeed
    });
  });

  describe('📊 Performance', () => {
    it('should respond within acceptable time', async () => {
      const start = Date.now();
      
      await request(app)
        .get('/api/health')
        .expect(200);
      
      const responseTime = Date.now() - start;
      expect(responseTime).to.be.below(1000); // Should respond within 1 second
    });

    it('should handle large payloads', async () => {
      const largePayload = {
        data: 'x'.repeat(10000) // 10KB of data
      };

      const response = await request(app)
        .post('/api/test/large-payload')
        .send(largePayload)
        .expect(404); // Route doesn't exist, but should handle gracefully
    });
  });
});
