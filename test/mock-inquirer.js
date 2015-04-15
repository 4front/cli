var _ = require('lodash');
var async = require('async');

module.exports = function(mockAnswers) {
  var askedQuestions = [];

  return {
    prompt: function(questions, callback) {
      var answers = {};
      debugger;

      async.eachSeries(questions, function(question, cb) {
        var shouldAsk = true;
        if (_.isFunction(question.when)) {
          debugger;
          if (question.when(answers) === false)
            return cb();
        }

        askedQuestions.push(question.name);

        var mockAnswer = mockAnswers[question.name];
        if (_.isUndefined(mockAnswer))
          return cb(new Error("No mock answer provided for question " + question.name));

        if (_.isFunction(mockAnswer))
          mockAnswer = mockAnswer(answers);

        // if (_.isFunction(question.validate)) {
        //   var valid = question.validate(mockAnswer);
        //   if (valid !== true) {
        //     errors.push()
        //     return cb(new Error(_.isString(valid) ? valid : "error"));
        //   }
        // }

        answers[question.name] = mockAnswer;
        cb();
      }, function() {
        debugger;
        callback(answers);
      });
    },

    wasAsked: function(name) {
      return _.contains(askedQuestions, name);
    }
  };
};
