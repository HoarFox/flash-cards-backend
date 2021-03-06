const webpush = require("web-push");
const auth = require("./auth.js");
const userModel = require("./user_model.js");
const moduleModel = require("./module_model.js");
const cardModel = require("./card_model.js");
const notificationModel = require("./notification_model.js");
const constants = require("./constants.js");

const { stages } = constants;

let usersNotifTimers = {};

const notifications = {
  respose(status, res, data) {
    res.writeHead(status, {
      "Access-Control-Allow-Origin": `${constants.corsURL}`,
      "Access-Control-Allow-Credentials": true,
    });
    if (data) {
      res.write(JSON.stringify(data));
    }
    res.end();
  },

  manage(method, req, res) {
    let reqData = [];
    let resData;
    let user;

    console.log(method);

    req.on("data", (chunk) => {
      reqData.push(chunk);
    });

    req.on("end", async () => {
      if (reqData.length) {
        reqData = JSON.parse(Buffer.concat(reqData).toString());
      }

      switch (method) {
        case "/subscribe":
          user = await auth.init(req);

          if (user) {
            let result = await this.subscribe(user, reqData);

            if (result) {
              this.respose(200, res, { msg: "All is good", ...result });
            } else {
              this.respose(500, res, { msg: "Server error" });
            }
          } else {
            this.respose(401, res, { msg: "Failed to authorize" });
          }
          break;

        case "/test":
          user = await auth.init(req);

          if (user) {
            let result = await this.createNotifications(user);

            if (result) {
              this.respose(200, res, { msg: "All is good", ...result });
            } else {
              this.respose(500, res, { msg: "Server error" });
            }
          } else {
            this.respose(401, res, { msg: "Failed to authorize" });
          }
          break;

        case "/test2":
          user = await auth.init(req);

          if (user) {
            let result = await this.newNotif(user);

            if (result) {
              this.respose(200, res, { msg: "All is good", ...result });
            } else {
              this.respose(500, res, { msg: "Server error" });
            }
          } else {
            this.respose(401, res, { msg: "Failed to authorize" });
          }
          break;

        case "/test3":
          user = await auth.init(req);

          if (user) {
            let result = await this.sendNotifications();

            if (result) {
              this.respose(200, res, { msg: "All is good", ...result });
            } else {
              this.respose(500, res, { msg: "Server error" });
            }
          } else {
            this.respose(401, res, { msg: "Failed to authorize" });
          }
          break;

        default:
      }
    });
  },

  notificationTimeout: async (user) => {
    if (usersNotifTimers[user._id]) clearTimeout(usersNotifTimers[user._id]);

    usersNotifTimers[user._id] = setTimeout(async () => {
      await notifications.createNotifications(user);
      usersNotifTimers[user._id] = false;
    }, 15000);
  },

  async createNotifications(user) {
    let newCardModel = cardModel(user.username);
    // let newNotifModel = notificationModel(user.username);

    try {
      await notificationModel.deleteMany({ user_id: user._id });

      let cards = await newCardModel.find({
        studyRegime: true,
      });

      if (!cards.length) return false;

      cards.sort((a, b) => a.nextRep.getTime() - b.nextRep.getTime());

      let notifArr = [];

      let notif;

      let remindTime;

      for (let card of cards) {
        if (card.nextRep.getTime() - Date.now() <= 0) {
          continue;
        }

        if (!notif) {
          notif = {
            cards: [card],
            number: 1,
            calcTime: card.nextRep,
            calcPrevStage: card.prevStage,
            time: card.nextRep,
            user_id: user._id,
            stage: card.stage,
          };

          notif.calcTime = card.nextRep;

          notifArr.push(notif);

          remindTime = new Date(
            new Date(notif.calcTime.getTime() + 86400000).setHours(12, 0, 0, 0)
          );
        } else {
          let stageDelay;
          // New logic
          if (
            card.stage < notif.stage &&
            card.prevStage.getTime() < notif.calcPrevStage.getTime()
          ) {
            notif.stage = card.stage;
            notif.calcTime = card.nextRep;
            notif.calcPrevStage = card.prevStage;
            notif.time = card.nextRep;
          }

          if (notif.stage >= 3) {
            stageDelay = 10800000;
          } else {
            stageDelay = stages[notif.stage - 2].prevStage;
          }

          if (card.nextRep.getTime() - notif.calcTime.getTime() < stageDelay) {
            notif.cards.push(card);
            notif.number++;
            notif.time = card.nextRep;
          } else {
            notif = {
              cards: [card],
              number: 1,
              calcTime: card.nextRep,
              calcPrevStage: card.prevStage,
              time: card.nextRep,
              user_id: user._id,
              stage: card.stage,
            };

            notifArr.push(notif);
          }
        }
      }

      if (notifArr.length) {
        for (let i = 0; i < 4; i++) {
          notifArr.push({
            cards: [],
            number: 0,
            time: remindTime,
            user_id: user._id,
          });

          remindTime = new Date(remindTime.getTime() + 86400000);
        }
      }

      let resultNotif = [];

      for (let notif of notifArr) {
        let item = await notificationModel.create(notif);
        resultNotif.push(item);
      }

      return resultNotif;
    } catch (err) {
      console.log(err);
      return false;
    }
  },

  async sendNotifications() {
    try {
      let users = {};

      let now = new Date(Date.now());

      let notifications = await notificationModel.find({ time: { $lt: now } });

      if (!notifications.length) return false;

      for (let notif of notifications) {
        let _id = notif.user_id;

        if (!users.hasOwnProperty(_id)) {
          let user = await userModel.findOne({ _id });
          users[_id] = user;
        }

        let payload = {
          title: "It's time to study some cards!",
        };

        console.log(notif.number);

        if (notif.number) {
          payload.body = `You have ${notif.number} card${
            notif.number > 1 ? "s" : ""
          } to repeat`;
        } else {
          payload.body = "You still have cards to repeat :)";
        }

        payload = JSON.stringify(payload);

        let { pc, tablet, mobile } = users[_id].subscriptions;

        const errCallback = (err) => {
          if (err.statusCode === 404 || err.statusCode === 410) {
            console.log(
              "Subscription has expired or is no longer valid: ",
              err
            );
          } else {
            console.log(err);
          }
        };

        if (pc) webpush.sendNotification(pc, payload).catch(errCallback);
        if (tablet)
          webpush.sendNotification(tablet, payload).catch(errCallback);
        if (mobile)
          webpush.sendNotification(mobile, payload).catch(errCallback);

        await notificationModel.deleteOne({ _id: notif._id });
      }

      let result = {
        users,
        notifications,
      };

      return result;
    } catch (err) {
      console.log(err);
      return false;
    }
  },

  async subscribe(user, data) {
    let { device, subscription } = data;

    try {
      if (!user.subscriptions[device]) {
        user.subscriptions[device] = subscription;
        await user.save();
      } else {
        if (!(user.subscriptions[device].endpoint === subscription.endpoint)) {
          user.subscriptions[device] = subscription;
          await user.save();
        }
      }

      let result = {
        user,
      };

      return result;
    } catch (err) {
      console.log(err);
      return false;
    }
  },

  async newNotif(user) {
    try {
      let notif = await notificationModel.create({
        time: new Date(Date.now() - 5000),
        number: 5,
        user_id: user._id,
      });

      let result = {
        notif,
      };

      return result;
    } catch (err) {
      console.log(err);
      return false;
    }
  },
};

module.exports = notifications;
