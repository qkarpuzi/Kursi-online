const express = require('express');
const router = express.Router();

router.get('/', (req, res) => res.json({ message: 'assignments route works' }));

module.exports = router;