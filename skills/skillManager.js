import fs from 'fs';
import path from 'path';
import Ajv from 'ajv';

class SkillManager {
  constructor(skillsDir = path.join(__dirname)) {
    this.skillsDir = skillsDir;
    this.schemaPath = path.join(skillsDir, 'skill-schema.json');
    this.skills = new Map();
    this.validator = null;

    this.loadSchema();
    this.loadAllSkills();
  }

  loadSchema() {
    try {
      const schemaContent = fs.readFileSync(this.schemaPath, 'utf8');
      const schema = JSON.parse(schemaContent);
      const ajv = new Ajv({ allErrors: true });
      this.validator = ajv.compile(schema);
      console.log('Skill schema loaded successfully');
    } catch (error) {
      console.error('Error loading skill schema:', error);
      throw error;
    }
  }

  validateSkill(skillData) {
    if (!this.validator) {
      throw new Error('Schema validator not initialized');
    }

    const valid = this.validator(skillData);
    if (!valid) {
      const errors = this.validator.errors.map(err =>
        `${err.instancePath} ${err.message}`
      ).join(', ');
      throw new Error(`Skill validation failed: ${errors}`);
    }
    return true;
  }

  loadSkill(skillFile) {
    try {
      const filePath = path.join(this.skillsDir, skillFile);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const skillData = JSON.parse(content);

      // Validate the skill data
      this.validateSkill(skillData);

      // Store the skill with additional metadata
      this.skills.set(skillData.name, {
        ...skillData,
        fileName: skillFile,
        filePath: filePath,
        lastModified: fs.statSync(filePath).mtime
      });

      return skillData;
    } catch (error) {
      console.error(`Error loading skill ${skillFile}:`, error);
      return null;
    }
  }

  loadAllSkills() {
    try {
      const files = fs.readdirSync(this.skillsDir)
        .filter(file => file.endsWith('.json') && file !== 'skill-schema.json');

      this.skills.clear();

      for (const file of files) {
        this.loadSkill(file);
      }

      console.log(`Loaded ${this.skills.size} skills`);
    } catch (error) {
      console.error('Error loading skills:', error);
    }
  }

  getSkill(name) {
    return this.skills.get(name) || null;
  }

  getAllSkills() {
    return Array.from(this.skills.values());
  }

  getSkillsByStatus(status) {
    return this.getAllSkills().filter(skill => skill.status === status);
  }

  getSkillsByCategory(category) {
    return this.getAllSkills().filter(skill => skill.category === category);
  }

  createSkill(skillData) {
    this.validateSkill(skillData);

    // Set creation and update dates
    const now = new Date().toISOString().split('T')[0];
    skillData.created = skillData.created || now;
    skillData.updated = now;

    const fileName = `${skillData.name}.json`;
    const filePath = path.join(this.skillsDir, fileName);

    // Check if skill already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`Skill ${skillData.name} already exists`);
    }

    fs.writeFileSync(filePath, JSON.stringify(skillData, null, 2));
    this.loadSkill(fileName);

    console.log(`Created skill: ${skillData.name}`);
    return skillData;
  }

  updateSkill(name, updates) {
    const existingSkill = this.getSkill(name);
    if (!existingSkill) {
      throw new Error(`Skill ${name} not found`);
    }

    const updatedSkill = {
      ...existingSkill,
      ...updates,
      updated: new Date().toISOString().split('T')[0]
    };

    this.validateSkill(updatedSkill);

    const filePath = existingSkill.filePath;
    fs.writeFileSync(filePath, JSON.stringify(updatedSkill, null, 2));

    this.loadSkill(existingSkill.fileName);

    console.log(`Updated skill: ${name}`);
    return updatedSkill;
  }

  deleteSkill(name) {
    const skill = this.getSkill(name);
    if (!skill) {
      throw new Error(`Skill ${name} not found`);
    }

    fs.unlinkSync(skill.filePath);
    this.skills.delete(name);

    console.log(`Deleted skill: ${name}`);
    return true;
  }

  searchSkills(query) {
    const lowercaseQuery = query.toLowerCase();
    return this.getAllSkills().filter(skill =>
      skill.name.toLowerCase().includes(lowercaseQuery) ||
      skill.description.toLowerCase().includes(lowercaseQuery) ||
      (skill.tags && skill.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))) ||
      (skill.category && skill.category.toLowerCase().includes(lowercaseQuery))
    );
  }

  getSkillStats() {
    const skills = this.getAllSkills();
    const stats = {
      total: skills.length,
      byStatus: {},
      byCategory: {},
      recent: skills
        .filter(skill => skill.updated)
        .sort((a, b) => new Date(b.updated) - new Date(a.updated))
        .slice(0, 5)
    };

    skills.forEach(skill => {
      stats.byStatus[skill.status] = (stats.byStatus[skill.status] || 0) + 1;
      stats.byCategory[skill.category] = (stats.byCategory[skill.category] || 0) + 1;
    });

    return stats;
  }
}

export default SkillManager;
