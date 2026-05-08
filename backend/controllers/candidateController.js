const { Candidate, Election, AuditLog } = require('../models');
const { getClientIP } = require('../utils');
const cloudinary = require('../config/cloudinary');

const getCandidatesByElection = async (req, res) => {
  try {
    const { electionId } = req.params;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    const candidates = await Candidate.find({ election: electionId })
      .sort({ displayOrder: 1, createdAt: 1 });

    res.status(200).json({
      success: true,
      data: candidates,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const createCandidate = async (req, res) => {
  try {
    const { electionId } = req.params;
    const candidateData = req.body;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Handle photo upload
    if (req.file) {
      const result = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
        {
          folder: 'votewave/candidates',
          public_id: `candidate-${Date.now()}`,
        }
      );
      candidateData.photo = result.secure_url;
    }

    const candidate = await Candidate.create({
      ...candidateData,
      election: electionId,
    });

    // Add candidate to election
    election.candidates.push(candidate._id);
    await election.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'CANDIDATE_ADD',
      targetType: 'candidate',
      targetId: candidate._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { 
        electionId,
        candidateName: candidate.name,
      },
    });

    res.status(201).json({
      success: true,
      message: 'Candidate added successfully',
      data: candidate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const updateCandidate = async (req, res) => {
  try {
    const { electionId, candidateId } = req.params;
    const updates = req.body;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate || candidate.election.toString() !== electionId) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Handle photo upload
    if (req.file) {
      // Delete old photo if exists
      if (candidate.photo) {
        const publicId = candidate.photo.split('/').pop().split('.')[0];
        await cloudinary.uploader.destroy(`votewave/candidates/${publicId}`);
      }

      const result = await cloudinary.uploader.upload(
        `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`,
        {
          folder: 'votewave/candidates',
          public_id: `candidate-${Date.now()}`,
        }
      );
      updates.photo = result.secure_url;
    }

    Object.assign(candidate, updates);
    await candidate.save();

    await AuditLog.create({
      user: req.user._id,
      action: 'CANDIDATE_UPDATE',
      targetType: 'candidate',
      targetId: candidate._id,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { 
        electionId,
        candidateName: candidate.name,
        changes: Object.keys(updates),
      },
    });

    res.status(200).json({
      success: true,
      message: 'Candidate updated successfully',
      data: candidate,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const deleteCandidate = async (req, res) => {
  try {
    const { electionId, candidateId } = req.params;

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    const candidate = await Candidate.findById(candidateId);
    if (!candidate || candidate.election.toString() !== electionId) {
      return res.status(404).json({
        success: false,
        message: 'Candidate not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Prevent deleting candidates with votes
    if (candidate.voteCount > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete a candidate with votes',
      });
    }

    // Delete photo from cloudinary
    if (candidate.photo) {
      const publicId = candidate.photo.split('/').pop().split('.')[0];
      await cloudinary.uploader.destroy(`votewave/candidates/${publicId}`);
    }

    // Remove candidate from election
    election.candidates = election.candidates.filter(
      id => id.toString() !== candidateId
    );
    await election.save();

    await Candidate.findByIdAndDelete(candidateId);

    await AuditLog.create({
      user: req.user._id,
      action: 'CANDIDATE_REMOVE',
      targetType: 'candidate',
      targetId: candidateId,
      ipAddress: getClientIP(req),
      userAgent: req.headers['user-agent'],
      details: { 
        electionId,
        candidateName: candidate.name,
      },
    });

    res.status(200).json({
      success: true,
      message: 'Candidate removed successfully',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const reorderCandidates = async (req, res) => {
  try {
    const { electionId } = req.params;
    const { order } = req.body; // Array of { candidateId, displayOrder }

    const election = await Election.findById(electionId);
    if (!election) {
      return res.status(404).json({
        success: false,
        message: 'Election not found',
      });
    }

    // Check permissions
    if (election.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'superadmin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied',
      });
    }

    // Update display order for all candidates
    const updatePromises = order.map(({ candidateId, displayOrder }) =>
      Candidate.findByIdAndUpdate(candidateId, { displayOrder })
    );

    await Promise.all(updatePromises);

    const candidates = await Candidate.find({ election: electionId })
      .sort({ displayOrder: 1 });

    res.status(200).json({
      success: true,
      message: 'Candidates reordered successfully',
      data: candidates,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getCandidatesByElection,
  createCandidate,
  updateCandidate,
  deleteCandidate,
  reorderCandidates,
};
