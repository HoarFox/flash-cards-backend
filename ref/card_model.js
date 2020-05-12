const mongoose = require("mongoose");

const Schema = mongoose.Schema;

const cardSchema = new Schema({
  moduleID: String,
  term: String,
  defenition: String,
  imgurl: String,
  creation_date: Date,
  studyRegime: Boolean,
});

function cardModel(username) {
  return mongoose.model(`${username}'s cards`, cardSchema);
}

module.exports = cardModel;
