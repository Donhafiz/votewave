import { Router } from 'express';

import authRoutes from './authRoutes';
import electionRoutes from './electionRoutes';
import userRoutes from './userRoutes';
import voteRoutes from './voteRoutes';
import adminRoutes from './adminRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/elections', electionRoutes);
router.use('/users', userRoutes);
router.use('/votes', voteRoutes);
router.use('/admin', adminRoutes);

export default router;