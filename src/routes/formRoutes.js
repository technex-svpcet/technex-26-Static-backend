const router=require('express').Router();
const multer=require('multer');
const {register}=require('../controllers/formController');
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:3*1024*1024,files:1,fields:80},fileFilter(req,file,cb){if(['image/jpeg','image/png','image/webp'].includes(file.mimetype))cb(null,true);else cb(Object.assign(new Error('Screenshot must be JPEG, PNG or WebP'),{status:400}));}});
router.post('/:event',upload.single('paymentScreenshot'),register);
module.exports={registrationRouter:router};
