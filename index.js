const express = require('express')
const cors = require('cors')
const app = express()
require('dotenv').config()
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const stripe = require('stripe')(process.env.STRIPE_SECRET);
// const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

const serviceAccount = require("./local-chef-bazaar-9fed2-firebase-adminsdk-fbsvc-aa7e96a24c.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});



const port = process.env.PORT || 3000

app.use(express.json())
app.use(cors())

//  Verify JWT ------------------------------
// const verifyJWT = async(req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader) {
//     return res.status(401).send({ message: "Unauthorized" });
//   }
//   try{
//   const token = authHeader.split(" ")[1];
//   const decoded = await admin.auth().verifyIdToken(token)
//   req.decoded_email = decoded.email
//    next();
//   }
//   catch(err){
//     res.status(401).send({message:'unauthorized acess'})

//   }



// };


// const verifyJWT = async (req, res, next) => {
//   const authHeader = req.headers.authorization;
//   console.log(authHeader)
//   if (!authHeader) {
//     return res.status(401).send({ message: "Unauthorized" });
//   }

//   try {
//     const token = authHeader.split(" ")[1];
//     const decoded = await admin.auth().verifyIdToken(token);

//     // Get user from DB
//     const user = await usersCollection.findOne({ email: decoded.email });
//     if (!user) return res.status(403).send({ message: "Forbidden: User not found" });

//     req.user = user; // <-- store the user info for later middleware
//     next();
//   } catch (err) {
//     console.error(err);
//     res.status(401).send({ message: "Unauthorized access" });
//   }
// };


//  Verify Admin ------------------------------
// const verifyAdmin = (req, res, next) => {
//   const role = req.user?.role;

//   if (role !== "admin") {
//     return res.status(403).send({ message: "Forbidden: Admin only" });
//   }

//   next();
// };

// ----------------------------
// MongoDB Connection
// ----------------------------
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q7tqgdi.mongodb.net/?appName=Cluster0`;



const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// ----------------------------
// Run Server & Setup DB
// ----------------------------
async function run() {
  try {
    await client.connect();

    const db = client.db("localchefbazaar_db");
    const mealsCollection = db.collection("meals");
    const reviewsCollection = db.collection("reviews");
    const favoritesCollection = db.collection("favorites");
    const ordersCollection = db.collection("order_collection");
    const usersCollection = db.collection("users");
    const roleRequestsCollection = db.collection("role_requests");


    // vefiry jwt
    // ========================
    const verifyJWT = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      // console.log(authHeader)
      if (!authHeader) {
        return res.status(401).send({ message: "Unauthorized" });
      }

      try {
        const token = authHeader.split(" ")[1];
        const decoded = await admin.auth().verifyIdToken(token);

        // Get user from DB
        const user = await usersCollection.findOne({ email: decoded.email });
        if (!user) return res.status(403).send({ message: "Forbidden: User not found" });

        req.user = user; // <-- store the user info for later middleware
        next();
      } catch (err) {
        console.error(err);
        res.status(401).send({ message: "Unauthorized access" });
      }
    };
    // verify admin
    // ===========================
    const verifyAdmin = (req, res, next) => {
      const role = req.user?.role;

      if (role !== "admin") {
        return res.status(403).send({ message: "Forbidden: Admin only" });
      }

      next();
    };




    // Add user when they register or first login
    //========================================
    app.post("/users", async (req, res) => {
      const user = req.body; // { name, email, photoURL, role? }
      try {
        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email: user.email });
        if (existingUser) return res.send({ message: "User already exists", user: existingUser });

        // Insert new user
        const result = await usersCollection.insertOne({
          ...user,
          role: "user", // default role
          status: "active",
        });
        res.send({ message: "User created successfully", user: result });
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Failed to create user" });
      }
    });

    // GET all users (Admin only)
    app.get("/admin/users", verifyJWT, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch users" });
      }
    });

    // PATCH make user fraud
    app.patch("/admin/users/fraud/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;

      try {
        const user = await usersCollection.findOne({ _id: new ObjectId(id) });
        if (!user) return res.status(404).send({ error: "User not found" });

        if (user.role === "admin") {
          return res.status(403).send({ error: "Cannot make admin fraud" });
        }

        if (user.status === "fraud") {
          return res.status(400).send({ error: "User is already fraud" });
        }

        await usersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status: "fraud" } }
        );

        res.send({ success: true, message: "User marked as fraud" });
      } catch (err) {
        res.status(500).send({ error: "Failed to update user status" });
      }
    });



    // ----------------------------
    // 📌 POST Meals
    // ----------------------------
    // app.post("/meals", async (req, res) => {
    //   const mealData = req.body;
    //   const result = await mealsCollection.insertMany(mealData);
    //   res.send(result);
    // });

    // app.post("/meals", async (req, res) => {
    //   try {
    //     const meal = req.body;
    //     const result = await mealsCollection.insertOne(meal);
    //     res.send(result);
    //   } catch (err) {
    //     res.status(500).send({ error: "Failed to create meal" });
    //   }
    // });
    app.post("/meals", verifyJWT, async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.user.email });
        if (user.status === "fraud") {
          return res.status(403).send({ message: "Fraud users cannot create meals" });
        }

        const meal = req.body;
        meal.userEmail = req.user.email; // associate meal with chef
        const result = await mealsCollection.insertOne(meal);
        res.send(result);
      } catch (err) {
        res.status(500).send({ error: "Failed to create meal" });
      }
    });


    // ----------------------------
    // 📌 GET All Meals
    // ----------------------------
    app.get("/meals", async (req, res) => {
      const meals = await mealsCollection.find().toArray();
      res.send(meals);
    });

    // ----------------------------
    // 📌 GET Single Meal by ID
    // ----------------------------
    // app.get("/meals/:id", async (req, res) => {
    //   const { id } = req.params;

    //   try {
    //     const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

    //     if (!meal) {
    //       return res.status(404).send({ error: "Meal not found" });
    //     }

    //     res.send(meal);

    //   } catch (error) {
    //     console.log(error);
    //     res.status(500).send({ error: "Invalid Meal ID" });
    //   }
    // });

    // Single route for fetching a meal by ID
    app.get("/meals/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const meal = await mealsCollection.findOne({ _id: new ObjectId(id) });

        if (!meal) {
          return res.status(404).send({ error: "Meal not found" });
        }

        res.send(meal);
      } catch (err) {
        console.log(err);
        res.status(500).send({ error: "Invalid Meal ID" });
      }
    });


    //  get meals by chef email paermas
    // =========================

    app.get("/meals/chef/:email", async (req, res) => {
      const meals = await mealsCollection.find({ userEmail: req.params.email }).toArray();
      res.send(meals);
    });


    //  get meals by chef email
    // =========================
    app.get("/meals", async (req, res) => {
      const email = req.query.email;

      const result = await mealsCollection
        .find({ userEmail: email })
        .toArray();

      res.send(result);
    });

    // delete meals
    // =============================

    app.delete("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const result = await mealsCollection.deleteOne({ _id: new ObjectId(id) });
      res.send(result);
    });

    // update meal api
    // ==================
    app.put("/meals/:id", async (req, res) => {
      const id = req.params.id;
      const updatedMeal = req.body;

      const result = await mealsCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedMeal }
      );

      res.send(result);
    });



    // =================================================================
    // ⭐⭐ REVIEWS APIs ⭐⭐
    // =================================================================

    // ----------------------------
    // 📌 GET Reviews for a Meal
    // ----------------------------
    app.get("/reviews/:mealId", async (req, res) => {
      const mealId = req.params.mealId;

      const reviews = await reviewsCollection
        .find({ foodId: mealId })
        .sort({ date: -1 })
        .toArray();

      res.send(reviews);
    });

    // ----------------------------
    // 📌 POST Review for a Meal
    // ----------------------------
    app.post("/reviews", async (req, res) => {
      const reviewData = req.body;  // full object from frontend

      reviewData.date = new Date(); // Auto timestamp

      const result = await reviewsCollection.insertOne(reviewData);
      res.send(result);
    });

    // =================================================================
    // ⭐⭐ FAVORITES APIs ⭐⭐
    // =================================================================

    // ----------------------------
    // 📌 POST Add to Favorites
    // ----------------------------
    app.post("/favorites", async (req, res) => {
      const favorite = req.body;

      const exists = await favoritesCollection.findOne({
        userEmail: favorite.userEmail,
        mealId: favorite.mealId,
      });

      if (exists) {
        return res.send({ message: "Already added", inserted: false });
      }

      favorite.addedTime = new Date();

      const result = await favoritesCollection.insertOne(favorite);
      res.send({ inserted: true, result });
    });

    // ----------------------------
    // 📌 GET Favorites by User Email
    // ----------------------------
    app.get("/favorites/:email", async (req, res) => {
      const email = req.params.email;

      const items = await favoritesCollection
        .find({ userEmail: email })
        .sort({ addedTime: -1 })
        .toArray();

      res.send(items);
    });

    // delete favourite
    // ===========================

    app.delete("/favorites/:id", async (req, res) => {
      const id = req.params.id;

      try {
        const result = await favoritesCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: result.deletedCount > 0 });
      } catch (err) {
        res.status(500).send({ error: "Failed to delete favorite" });
      }
    });


    // POST: Create a new order
    // app.post("/orders", async (req, res) => {
    //   try {
    //     const order = req.body;
    //     order.orderStatus = "pending";
    //     order.orderTime = new Date();

    //     const result = await ordersCollection.insertOne(order);
    //     res.send({ success: true, orderId: result.insertedId });
    //   } catch (error) {
    //     console.log(error);
    //     res.status(500).send({ success: false, message: "Failed to place order" });
    //   }
    // });
    app.post("/orders", verifyJWT, async (req, res) => {
      try {
        const user = await usersCollection.findOne({ email: req.user.email });
        if (user.status === "fraud") {
          return res.status(403).send({ message: "Fraud users cannot place orders" });
        }

        const order = req.body;
        order.userEmail = req.user.email;
        order.orderStatus = "pending";
        order.orderTime = new Date();

        const result = await ordersCollection.insertOne(order);
        res.send({ success: true, orderId: result.insertedId });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: "Failed to place order" });
      }
    });


    // verfy-paymetnt
    // ===========================
    // PATCH order payment status
    app.patch("/orders/:id/paid", async (req, res) => {
      const { id } = req.params; // order _id
      const { sessionId } = req.body; // optional, from Stripe

      try {
        const session = await stripe.checkout.sessions.retrieve(sessionId);

        if (session.payment_status === "paid") {
          const result = await ordersCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: { paymentStatus: "paid" } }
          );

          return res.send({ success: true, message: "Payment verified & updated", result });
        }

        res.status(400).send({ success: false, message: "Payment not completed" });
      } catch (err) {
        console.error(err);
        res.status(500).send({ success: false, message: err.message });
      }
    });


    // GET: Orders by user email
    app.get("/orders/:email", async (req, res) => {
      const email = req.params.email;
      const orders = await ordersCollection.find({ userEmail: email }).toArray();
      res.send(orders);
    });

    // GET pending orders for a chef
    // app.get("/chef-orders/:chefId", async (req, res) => {
    //   const { chefId } = req.params;
    //   console.log("Chef ID received:", chefId);

    //   const orders = await ordersCollection
    //     .find({ chefId: chefId, orderStatus: "pending" }) // exact match
    //     .toArray();

    //   console.log("Orders found:", orders);
    //   res.send(orders);
    // });

    // GET all orders for a chef (not only pending)
    app.get("/chef-orders/:chefId", async (req, res) => {
      const { chefId } = req.params;
      console.log("Chef ID received:", chefId);

      const orders = await ordersCollection
        .find({ chefId: chefId })  // ← removed orderStatus filter
        .sort({ orderTime: -1 })   // newest first
        .toArray();

      console.log("Orders found:", orders);
      res.send(orders);
    });


    // PATCH /orders/:id/paid
    // ----------------------------
    app.patch("/orders/:id/paid", async (req, res) => {
      const { id } = req.params;

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { paymentStatus: "paid" } }
        );

        res.send({ success: true, result });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: "Failed to mark order as paid" });
      }
    });



    // PATCH order status by chef
    app.patch("/orders/:id", async (req, res) => {
      const { id } = req.params;
      const { orderStatus } = req.body; // accepted / rejected

      try {
        const result = await ordersCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { orderStatus } }
        );

        res.send({ success: true, result });
      } catch (error) {
        console.log(error);
        res.status(500).send({ success: false, message: "Failed to update order" });
      }
    });

    //user emaile role
    //=========================

    app.get("/users/:email/role", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });
        res.send({ role: user.role });
      } catch (error) {
        res.status(500).send({ error: "Server error" });
      }
    });


    // ----------------------------
    // 📌 GET API: Get user info by email
    // ----------------------------
    app.get("/users/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const user = await usersCollection.findOne({ email });
        if (!user) return res.status(404).send({ error: "User not found" });
        res.send(user);
      } catch (error) {
        res.status(500).send({ error: "Server error" });
      }
    });

    // ----------------------------
    // 📌 POST API: Send role upgrade request
    // ----------------------------
    app.post("/role-request", async (req, res) => {
      const requestData = req.body;
      try {
        requestData.requestStatus = "pending";
        requestData.requestTime = new Date();

        const result = await roleRequestsCollection.insertOne(requestData);
        res.send({ success: true, data: result });
      } catch (error) {
        res.status(500).send({ error: "Failed to submit request" });
      }
    });

    // GET all role requests (Admin)
    app.get("/role-requests", async (req, res) => {
      const requests = await roleRequestsCollection.find().sort({ requestTime: -1 }).toArray();
      res.send(requests);
    });


    // Stripe payment 
    //==========================
    // POST /create-payment-intent
    // ----------------------------
    // app.post("/create-checkout-session", async (req, res) => {
    //   const paymentInfo = req.body;
    //   const amount=paymentInfo.price
    //   const session = await stripe.checkout.sessions.create({line_items: [
    //   {
    //       price_data: {
    //       currency:'USD',
    //       unit_amount:amount,
    //     },
    //     quantity: 1,
    //   },
    // ],
    // mode: 'payment',
    // success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success`,

    // cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,

    // })

    //       console.log(session)
    //       res.send({ url: session.url})

    // });
    app.post("/create-checkout-session", async (req, res) => {
      const { price, orderId, userEmail } = req.body;
      const amount = parseInt(price) * 100; // convert to cents

      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "USD",
              product_data: { name: "Food Order" }, // REQUIRED
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        metadata: { orderId, userEmail },
        success_url: `${process.env.SITE_DOMAIN}/dashboard/payment-success?session_id={CHECKOUT_SESSION_ID}&order_id=${orderId}`,
        cancel_url: `${process.env.SITE_DOMAIN}/dashboard/payment-cancelled`,
      });

      res.send({ url: session.url });
    });



    // PATCH approve or reject request
    // app.patch("/role-request/:id", async (req, res) => {
    //   const { id } = req.params;       // role request ID (string)
    //   const { action } = req.body;     // "approve" or "reject"

    //   // Find the request
    //   const request = await roleRequestsCollection.findOne({ _id: id });
    //   if (!request) return res.status(404).send({ error: "Request not found" });

    //   // Approve logic
    //   if (action === "approve") {
    //     const updateData = { role: request.requestType };

    //     // If the request type is 'chef', generate a chefId
    //     if (request.requestType === "chef") {
    //       // You can generate a unique chefId (example: "CH-xxx")
    //       const lastChef = await usersCollection
    //         .find({ chefId: { $exists: true } })
    //         .sort({ chefId: -1 })
    //         .limit(1)
    //         .toArray();

    //       let newChefId = "CH-101"; // default starting ID
    //       if (lastChef.length > 0) {
    //         // increment last chefId number
    //         const lastIdNum = parseInt(lastChef[0].chefId.split("-")[1]);
    //         newChefId = `CH-${lastIdNum + 1}`;
    //       }

    //       updateData.chefId = newChefId;
    //     }

    //     // Update user's role and chefId if applicable
    //     await usersCollection.updateOne(
    //       { email: request.userEmail },
    //       { $set: updateData }
    //     );
    //   }

    //   // Delete the role request after action
    //   await roleRequestsCollection.deleteOne({ _id: id });

    //   res.send({ success: true });
    // });

    // PATCH approve or reject request
    app.patch("/role-request/:id", verifyJWT, async (req, res) => {
      try {
        const { id } = req.params;
        const { action } = req.body;

        console.log("PATCH received ID:", id);

        // Since your DB uses string IDs, always match by string
        const query = { _id: id };

        const request = await roleRequestsCollection.findOne(query);

        if (!request) {
          return res.status(404).send({ error: "Request not found" });
        }

        if (action === "approve") {
          const updateData = {};

          if (request.requestType === "chef") {
            updateData.role = "chef";
            updateData.chefId = `chef-${Math.floor(1000 + Math.random() * 9000)}`;
          } else if (request.requestType === "admin") {
            updateData.role = "admin";
          }

          await usersCollection.updateOne(
            { email: request.userEmail },
            { $set: updateData }
          );

          await roleRequestsCollection.updateOne(query, {
            $set: { requestStatus: "approved" },
          });
        }

        if (action === "reject") {
          await roleRequestsCollection.updateOne(query, {
            $set: { requestStatus: "rejected" },
          });
        }

        res.send({ success: true, action });
      } catch (error) {
        console.error("PATCH /role-request ERROR:", error);
        res.status(500).send({ error: "Internal server error" });
      }
    });


    // GET reviews for a specific user
    app.get("/reviews/user/:email", async (req, res) => {
      const { email } = req.params;
      try {
        const reviews = await reviewsCollection
          .find({ userEmail: email })
          .sort({ date: -1 })
          .toArray();
        res.send(reviews);
      } catch (err) {
        res.status(500).send({ error: "Failed to fetch reviews" });
      }
    });

    // DELETE a review by _id
    app.delete("/reviews/:id", async (req, res) => {
      const { id } = req.params;
      try {
        const result = await reviewsCollection.deleteOne({ _id: new ObjectId(id) });
        res.send({ success: result.deletedCount > 0 });
      } catch (err) {
        res.status(500).send({ error: "Failed to delete review" });
      }
    });

    // PATCH review by _id
    app.patch("/reviews/:id", async (req, res) => {
      const { id } = req.params;
      const { rating, comment } = req.body;

      try {
        const result = await reviewsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { rating, comment, date: new Date() } }
        );
        res.send({ success: result.modifiedCount > 0 });
      } catch (err) {
        res.status(500).send({ error: "Failed to update review" });
      }
    });

    // MY fafvourite





    // ----------------------------
    // Server Ping
    // ----------------------------
    await client.db("admin").command({ ping: 1 });
    console.log("Successfully Connected to MongoDB!");
  } finally {
    // Do not close connection
  }
}

run().catch(console.dir);

// ----------------------------
// Default Route
// ----------------------------
app.get('/', (req, res) => {
  res.send('Local Chef Bazaar API Running!')
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`)
});
