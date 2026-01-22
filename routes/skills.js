import express from 'express';

const router = express.Router();

/**
 * Create skill routes
 * @param {Object} deps - Dependencies
 * @param {Function} deps.getAllSkills - Get all skills function
 * @param {Function} deps.getSkillsStats - Get skills stats function
 * @param {Function} deps.getSkillByName - Get skill by name function
 * @param {Function} deps.getSkillById - Get skill by ID function
 * @param {Function} deps.createSkill - Create skill function
 * @param {Function} deps.updateSkill - Update skill function
 * @param {Function} deps.deleteSkill - Delete skill function
 */
export function createSkillRoutes(deps) {
  const { getAllSkills, getSkillsStats, getSkillByName, getSkillById, createSkill, updateSkill, deleteSkill } = deps;

  // Get all skills with optional filters
  router.get('/', async (req, res) => {
    try {
      const { status, category, search } = req.query;
      let skills = await getAllSkills();

      // Apply filters
      if (status) {
        skills = skills.filter(skill => skill.status === status);
      }
      if (category) {
        skills = skills.filter(skill => skill.tags && skill.tags.includes(category));
      }
      if (search) {
        const searchLower = search.toLowerCase();
        skills = skills.filter(skill =>
          skill.name.toLowerCase().includes(searchLower) ||
          skill.description?.toLowerCase().includes(searchLower)
        );
      }

      res.json({ success: true, skills });
    } catch (error) {
      console.error('Error fetching skills:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch skills' });
    }
  });

  // Get skills stats
  router.get('/stats', async (req, res) => {
    try {
      const stats = await getSkillsStats();
      res.json({ success: true, stats });
    } catch (error) {
      console.error('Error fetching skills stats:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch skills stats' });
    }
  });

  // Get skill by name
  router.get('/:name', async (req, res) => {
    try {
      const skill = await getSkillByName(req.params.name);
      if (!skill) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }
      res.json({ success: true, skill });
    } catch (error) {
      console.error('Error fetching skill:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch skill' });
    }
  });

  // Create new skill
  router.post('/', async (req, res) => {
    try {
      const skillData = req.body;

      // Validate required fields
      if (!skillData.name || !skillData.version || !skillData.status) {
        return res.status(400).json({ success: false, error: 'Missing required fields' });
      }

      const skillId = await createSkill(skillData);
      const skill = await getSkillById(skillId);
      res.json({ success: true, skill });
    } catch (error) {
      console.error('Error creating skill:', error);
      res.status(500).json({ success: false, error: 'Failed to create skill' });
    }
  });

  // Update skill
  router.put('/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const updates = req.body;

      const existing = await getSkillByName(skillName);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }

      updates.updated = new Date().toISOString();
      await updateSkill(existing.id, { ...existing, ...updates });

      const updated = await getSkillByName(skillName);
      res.json({ success: true, skill: updated });
    } catch (error) {
      console.error('Error updating skill:', error);
      res.status(500).json({ success: false, error: 'Failed to update skill' });
    }
  });

  // Delete skill
  router.delete('/:name', async (req, res) => {
    try {
      const skillName = req.params.name;
      const existing = await getSkillByName(skillName);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Skill not found' });
      }

      await deleteSkill(existing.id);
      res.json({ success: true, message: 'Skill deleted successfully' });
    } catch (error) {
      console.error('Error deleting skill:', error);
      res.status(500).json({ success: false, error: 'Failed to delete skill' });
    }
  });

  return router;
}
