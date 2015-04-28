var _ = require('lodash');
var async = require('async');

module.exports = function(mockAnswers) {
  var askedQuestions = {};

  return {
    prompt: function(questions, callback) {
      var answers = {};

      async.eachSeries(questions, function(question, cb) {
        var shouldAsk = true;
        if (_.isFunction(question.when)) {
          if (question.when(answers) === false)
            return cb();
        }

        if (!askedQuestions[question.name])
          askedQuestions[question.name] = 1;
        else
          askedQuestions[question.name]++;

        var mockAnswer = mockAnswers[question.name];
        if (_.isUndefined(mockAnswer))
          return cb();

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
        callback(answers);
      });
    },

    wasAsked: function(name) {
      return _.has(askedQuestions, name);
    },

    askedCount: function(name) {
      if (!askedQuestions[name])
        return 0;
      else
        return askedQuestions[name];
    }
  };
};
