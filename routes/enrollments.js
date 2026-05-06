const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ message: 'enrollments route works' }));

module.exports = router;