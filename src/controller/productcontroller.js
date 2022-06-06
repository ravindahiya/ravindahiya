const productModel = require("../model/productmodel");
const validator = require("../Validator/validators");
const currencySymbol = require("currency-symbol-map");
const aws = require("aws-sdk");

aws.config.update({
  accessKeyId: "AKIAY3L35MCRUJ6WPO6J",
  secretAccessKey: "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",
  region: "ap-south-1",
});

const uploadFile = async (file) => {
  return new Promise(function (resolve, reject) {
    const s3 = new aws.S3({ apiVersion: "2006-03-01" });

    const uploadParams = {
      ACL: "public-read",
      Bucket: "classroom-training-bucket",
      Key: "Group 26/" + new Date() + file.originalname,
      Body: file.buffer,
    };

    s3.upload(uploadParams, function (err, data) {
      if (err) {
        return reject({ error: err });
      }
      return resolve(data.Location);
    });
  });
};

const createProduct = async (req, res) => {
  try {
    const requestBody = req.body;

    if (!validator.isValidRequestBody(requestBody)) {
      return res.status(400).send({
        status: false,
        message: "Invalid params received in request body",
      });
    }

    const {
      title,
      description,
      price,
      currencyId,
      isFreeShipping,
      style,
      availableSizes,
      installments,
    } = requestBody;

    if (!validator.isValid(title)) {
      return res
        .status(400)
        .send({ status: false, message: "Title is required" });
    }
    if (!validator.isValidString(title))
      return res
        .status(400)
        .send({
          status: false,
          message: "Invalid Title : Only string is accepted",
        });

    const isTitleAlreadyUsed = await productModel.findOne({ title });

    if (isTitleAlreadyUsed) {
      return res
        .status(400)
        .send({ status: false, message: "Title is already used." });
    }

    if (!validator.isValid(description)) {
      return res
        .status(400)
        .send({ status: false, message: "Description is required" });
    }

    if (!validator.isValid(price)) {
      return res
        .status(400)
        .send({ status: false, message: "Price is required" });
    }

    if (!isNaN(Number(price))) {
      return res
        .status(400)
        .send({ status: false, message: `Price should be a valid number` });
    }
    if (price <= 0) {
      return res
        .status(400)
        .send({ status: false, message: `Price should be a valid number` });
    }

    if (!validator.isValid(currencyId)) {
      return res
        .status(400)
        .send({ status: false, message: "CurrencyId is required" });
    }

    if (!(currencyId == "INR")) {
      return res
        .status(400)
        .send({ status: false, message: "currencyId should be INR" });
    }

    if (installments) {
      if (!validator.validInstallment(installments)) {
        return res.status(400).send({
          status: false,
          message:
            "installments can't be a decimal number & must be greater than equalto zero ",
        });
      }
    }

    if (validator.isValid(isFreeShipping)) {
      if (!(isFreeShipping === "true" || isFreeShipping === "false")) {
        return res.status(400).send({
          status: false,
          message: "isFreeShipping must be a boolean value",
        });
      }
    }

    let productImage = req.files;
    if (!(productImage && productImage.length > 0)) {
      return res
        .status(400)
        .send({ status: false, msg: "productImage is required" });
    }

    let productImageUrl = await uploadFile(productImage[0]);

    const newProductData = {
      title,
      description,
      price,
      currencyId,
      currencyFormat: currencySymbol(currencyId),
      isFreeShipping,
      style,
      installments,
      productImage: productImageUrl,
    };

    if (!validator.isValid(availableSizes)) {
      return res
        .status(400)
        .send({ status: false, message: "available Sizes is required" });
    }

    if (availableSizes) {
      let array = availableSizes.split(",").map((x) => x.trim());

      for (let i = 0; i < array.length; i++) {
        if (!["S", "XS", "M", "X", "L", "XXL", "XL"].includes(array[i])) {
          return res.status(400).send({
            status: false,
            message: `Available Sizes must be among ${[
              "S",
              "XS",
              "M",
              "X",
              "L",
              "XXL",
              "XL",
            ]}`,
          });
        }
      }

      if (Array.isArray(array)) {
        newProductData["availableSizes"] = array;
      }
    }

    const saveProductDetails = await productModel.create(newProductData);
    res
      .status(201)
      .send({ status: true, message: "Success", data: saveProductDetails });
  } catch (error) {
    console.log(error);
    res.status(500).send({ status: false, data: error });
  }
};

const filterProduct = async (req, res) => {
  try {
    const data = req.query;

    //delete keys if value is empty
    for (const [key, value] of Object.entries(data)) {
      if (key) {
        if (!value.trim()) {
          delete data[key];
        }
      }
    }

    if (!validator.isValidRequestBody(data)) {
      const allProducts = await productModel.find({ isDeleted: false });
      if (!allProducts) {
        return res
          .status(404)
          .send({ status: false, message: "No products found" });
      }
      return res.status(200).send({
        status: true,
        message: "products fetched successfully",
        data: allProducts,
      });
    } else {
      let availableSizes = req.query.size;
      let name = req.query.name;
      let priceGreaterThan = req.query.priceGreaterThan;
      let priceLessThan = req.query.priceLessThan;

      let filter = { isDeleted: false };

      if (name) {
        filter.title = { $regex: name, $options: "i" };
      }

      if (priceGreaterThan) {
        if (!/^[+]?([0-9]+\.?[0-9]*|\.[0-9]+)$/.test(priceGreaterThan)) {
          return res.status(400).send({
            status: false,
            message: "price filter should be a vaid number",
          });
        }
        filter.price = { $gt: `${priceGreaterThan}` };
      }
      if (priceLessThan) {
        if (!/^[+]?([0-9]+\.?[0-9]*|\.[0-9]+)$/.test(priceLessThan)) {
          return res.status(400).send({
            status: false,
            message: "price filter should be a vaid number",
          });
        }
        filter["price"] = { $lt: `${priceLessThan}` };
      }

      if (availableSizes) {
        if (Array.isArray(validator.isValidSize(availableSizes))) {
          filter["availableSizes"] = {
            $in: validator.isValidSize(availableSizes),
          };
        } else {
          return res.status(400).send({
            status: false,
            message: `size should be one these only ${[
              "S",
              "XS",
              "M",
              "X",
              "L",
              "XXL",
              "XL",
            ]}`,
          });
        }
      }

      //sorting
      if (req.query.priceSort) {
        if (req.query.priceSort != 1 && req.query.priceSort != -1) {
          return res.status(400).send({
            status: false,
            message: "use 1 for low to high and use -1 for high to low",
          });
        }
      }

      if (!priceGreaterThan && !priceLessThan) {
        const productList = await productModel
          .find(filter)
          .sort({ price: req.query.priceSort });
        if (productList.length == 0) {
          return res
            .status(400)
            .send({ status: false, message: "No available products" });
        }
        return res
          .status(200)
          .send({ status: true, message: "Products list", data: productList });
      }

      if (priceGreaterThan && priceLessThan) {
        const productList = await productModel
          .find({
            $and: [
              filter,
              { price: { $gt: priceGreaterThan } },
              {
                price: { $lt: priceLessThan },
              },
            ],
          })
          .sort({ price: req.query.priceSort });
        if (productList.length == 0) {
          return res
            .status(400)
            .send({ status: false, message: "No available products" });
        }
        return res
          .status(200)
          .send({ status: true, message: "Products list", data: productList });
      }

      if (priceGreaterThan || priceLessThan) {
        const productList = await productModel
          .find({ $and: [filter] })
          .sort({ price: req.query.priceSort });
        if (productList.length == 0) {
          return res
            .status(400)
            .send({ status: false, message: "No available products" });
        }
        return res
          .status(200)
          .send({ status: true, message: "Products list", data: productList });
      }
    }
  } catch (error) {
    res.status(500).send({
      status: false,
      Error: "Server not responding",
      message: error.message,
    });
  }
};

const productById = async function (req, res) {
  try {
    const productId = req.params.productId;

    if (!productId) {
      return res
        .status(400)
        .send({ status: false, message: "Please provide product Id" });
    }

    if (!validator.isValidRequestBody(productId)) {
      return res
        .status(400)
        .send({ status: false, message: "Invalid product Id" });
    }

    const findProduct = await productModel.findOne({
      _id: productId,
      isDeleted: false,
    });

    if (!findProduct) {
      return res.status(404).send({
        status: false,
        message: "Product not found or it maybe deleted",
      });
    }
    return res
      .status(200)
      .send({ status: true, message: "Product details", data: findProduct });
  } catch (error) {
    res.status(500).send({
      status: false,
      Error: "Server not responding",
      message: error.message,
    });
  }
};

const updateProduct = async (req, res) => {
  try {
    let body = req.body;
    const productId = req.params.productId;

    if (!validator.isValidRequestBody(body)) {
      return res.status(400).send({
        status: false,
        message:
          "Invalid request parameters. Please provide  details to update",
      });
    }

    if (!validator.isValidRequestBody(productId)) {
      return res
        .status(404)
        .send({ status: false, message: "productId is  Invalid" });
    }

    const findProduct = await productModel.findOne({
      _id: productId,
      isDeleted: false,
    });

    if (!findProduct) {
      res.status(404).send({ status: false, message: "product Not Found" });
      return;
    }

    let {
      title,
      price,
      currencyId,
      currencyFormat,
      isFreeShipping,
      availableSizes,
    } = body;

    if (title){
        const Title = await productModel.findOne({ title: title });
        if (Title) {
            res.status(400).send({ status: false, message: `${title} Is Already In Used`, });
            return;
    }
    }

    if (price) {
      if (!/^[+]?([0-9]+\.?[0-9]*|\.[0-9]+)$/.test(price)) {
        return res
          .status(400)
          .send({ status: false, message: "Please provide A Valid Price" });
      }
    }

    if (currencyId) {
      if (currencyId !== "INR") {
        res.status(400).send({
          status: false,
          message: "Please provide currencyId in INR only",
        });
        return;
      }
    }

    if (currencyFormat) {
      if (currencyFormat !== "₹") {
        res.status(400).send({
          status: false,
          message: "Please provide currencyFormat in format ₹ only",
        });
        return;
      }
    }

    if (isFreeShipping != undefined) {
      if (!(isFreeShipping == "false" || isFreeShipping == "true")) {
        res.status(400).send({
          status: false,
          message: "isFreeShipping will be either true or false",
        });
        return;
      }
    }

    if (availableSizes != undefined) {
      if (Array.isArray(validator.isValidSize(availableSizes))) {
        body.availableSizes = validator.isValidSize(availableSizes);
      } else {
        return res.status(400).send({
          status: false,
          message: `size should be one these only ${[
            "S",
            "XS",
            "M",
            "X",
            "L",
            "XXL",
            "XL",
          ]}`,
        });
      }
    }

    let files = req.files;
    if (files && files.length > 0) {
      const productImage = await uploadFile(files[0]);
      body.productImage = productImage;
      let updateProduct = await productModel.findOneAndUpdate(
        { _id: productId },
        body,
        { new: true }
      );
      res.status(200).send({
        status: true,
        message: "Successfully Updated",
        data: updateProduct,
      });
    } else {
      let updateProduct = await productModel.findOneAndUpdate(
        { _id: productId },
        body,
        { new: true }
      );
      res.status(200).send({
        status: true,
        message: "Successfully Updated",
        data: updateProduct,
      });
    }
  } catch (error) {
    res.status(500).send({
      status: false,
      Error: "Server not responding",
      message: error.message,
    });
  }
};

const deleteProduct = async function (req, res) {
  try {
      let productId = req.params.productId

      if (!productId) {
          return res.status(400).send({ status: false, message: "Please provide product Id" })
      }

      if (!validator.isValidObjectId(productId)) {
          return res.status(400).send({ status: false, message: "Invalid product Id" })
      }

      const findProduct = await productModel.findOne({ _id: productId, isDeleted: false })

      if (!findProduct) {
          return res.status(404).send({ status: false, message: "Product not found or it maybe deleted" })
      }

      const prodectDeleted = await productModel.findOneAndUpdate({ _id: productId }, { isDeleted: true, deletedAt: Date.now() }, { new: true })

      return res.status(200).send({ status: true, message: "Product deleted successfully", data: prodectDeleted })
  }
  catch (error) {
      res.status(500).send({ status: false, Error: "Server not responding", message: error.message, });
  }
}

module.exports = {
  createProduct,
  productById,
  filterProduct,
  deleteProduct,
  updateProduct,
};
