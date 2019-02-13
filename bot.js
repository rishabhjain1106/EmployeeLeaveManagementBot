const { ActivityTypes, CardFactory } = require('botbuilder');
const { LuisRecognizer } = require('botbuilder-ai');
const { DialogSet, DateTimePrompt, DialogTurnStatus, WaterfallDialog } = require('botbuilder-dialogs');

const { WelcomeUserBot } = require('./features/welcomeUser');
const { SampleHeroCardSchema, FlexibleHolidayList } = require('./resources/constants');
const holidayCard = require('./resources/holiday-calender.json');

const CONVERSATION_DATA_PROPERTY = 'conversationData';
const USER_PROFILE_PROPERTY = 'userProfile';
const DIALOG_STATE_PROPERTY = 'dialogState';
const LEAVE_DATE_PROMPT = 'leaveDatePrompt';
const CURRENTLEAVEDATEACCESSOR = 'currentLeaveDate';
const CASUAL_LEAVE_DIALOG = 'casualLeaveDialog';
const getDates = function(startDate, endDate) {
    var dates = [],
        currentDate = startDate,
        addDays = function(days) {
          var date = new Date(this.valueOf());
          date.setDate(date.getDate() + days);
          return date;
        };
    while (currentDate <= endDate) {
      dates.push(currentDate);
      currentDate = addDays.call(currentDate, 1);
    }
    return dates;
  };
const checkIfDateIsFlexible=function(date){
    if(date.constructor === Date){
       date =date.getFullYear()+'-'+date.getMonth()+'-'+date.getDate();
    }
    
    return FlexibleHolidayList.find(FlexibleHoliday => FlexibleHoliday.value === dateString) === undefined;
}
const leaveDateValidator =function(userProfile,date){
    const dateStatus={
        isValid:false,
        leaveType:{
            flexible:false,
            casual:true,
            weekend:false
        }
    }
    if(date.constructor !== Date){
        date=new Date(date);
    }
    if(date.getDay() !== 0 && date.getDay() !== 6){
        dateStatus.isValid=true;
        dateStatus.leaveType.flexible=checkIfDateIsFlexible(date);
        dateStatus.leaveType.casual=false;
    }
    return dateStatus;
}
class LeaveManagementBot {
    /**
     *
     * @param {UserState} User state to persist boolean flag to indicate
     *                    if the bot had already welcomed the user
     */
    constructor(luisApplication, luisPredictionOptions, conversationState, userState) {

        this.luisRecognizer = new LuisRecognizer(
            luisApplication,
            luisPredictionOptions,
            true
        );
        this.conversationState = conversationState;
        this.userState = userState;
        this.dialogState = this.conversationState.createProperty(DIALOG_STATE_PROPERTY); 
        this.conversationData = this.conversationState.createProperty(CONVERSATION_DATA_PROPERTY);
        this.userProfile = this.userState.createProperty(USER_PROFILE_PROPERTY);
        this.currentLeaveDateAccessor = this.conversationState.createProperty(CURRENTLEAVEDATEACCESSOR);
        this.dialogSet = new DialogSet(this.dialogState);
        this.dialogSet.add(
            new DateTimePrompt(LEAVE_DATE_PROMPT, this.dateValidator)
        );
        this.dialogSet.add(new WaterfallDialog(CASUAL_LEAVE_DIALOG,[
            this.promptForCasualLeaveDate.bind(this),
            this.showAcknowledgementForTakenLeave.bind(this)
        ]));

    }
    async dateValidator(promptContext) {
        // Check whether the input could be recognized as an integer.
        if (!promptContext.recognized.succeeded) {
            await promptContext.context.sendActivity(
                "I'm sorry, I do not understand. Please enter the date or time for your reservation."
            );
            return false;
        }

        // Check whether any of the recognized date-times are appropriate,
        // and if so, return the first appropriate date-time.
        const earliest = Date.now() + 60 * 60 * 1000;
        let value = null;
        promptContext.recognized.value.forEach(candidate => {
            // TODO: update validation to account for time vs date vs date-time vs range.
            const time = new Date(candidate.value || candidate.start);
            if (earliest < time.getTime()) {
                value = candidate;
            }
        });
        if (value) {
            promptContext.recognized.value = [value];
            return true;
        }

        await promptContext.context.sendActivity(
            "I'm sorry, we can't take reservations earlier than an hour from now."
        );
        return false;
    }
    async promptForCasualLeaveDate(stepContext) {
        // Prompt for the party size. The result of the prompt is returned to the next step of the waterfall.
        return await stepContext.prompt(LEAVE_DATE_PROMPT, {
            prompt: 'Ok. When will be the Leave for?',
            retryPrompt: 'Enter correct Date?'
        });
    }
    async showAcknowledgementForTakenLeave(stepContext) {
        // Retrieve the reservation date.
        const resolution = stepContext.result[0];
        const time = resolution.value || resolution.start;

        // Send an acknowledgement to the user.
        await stepContext.context.sendActivity(
            'Thank you. We will confirm your Leave Status shortly.'
        );

        // Return the collected information to the parent context.
        return await stepContext.endDialog({
            date: time
        });
    }
    /**
     *
     * @param {TurnContext} on turn context object.
     */
    async onTurn(turnContext) {
        // See https://aka.ms/about-bot-activity-message to learn more about the message and other activity types.
        if (turnContext.activity.type === ActivityTypes.Message) {
            const results = await this.luisRecognizer.recognize(turnContext);
            const topIntent = results.luisResult.topScoringIntent;
            // console.log(results.luisResult.entities[0].resolution);
            const userProfile = await this.userProfile.get(turnContext, {
                flexibleHolidayCount: 0,
                casualLeavesCount: 0,
                takenFlexibleHolidays: [],
                takenCasualLeaves: []
            });
            const dc = await this.dialogSet.createContext(turnContext);
            const isPostBack = turnContext.activity.channelData.postback;
            if(!dc.activeDialog){
                // if(isPostBack){
                //     if (checkIfDateIsFlexible(turnContext.activity.text)) {
                //         if (userProfile.flexibleHolidayCount < 3 && (userProfile.takenFlexibleHolidays.filter(takenFlexibleHoliday => takenFlexibleHoliday.value === turnContext.activity.text).length <= 0)) {
                //             userProfile.flexibleHolidayCount++;
                //             userProfile.takenFlexibleHolidays.push(turnContext.activity.text);
                //             await this.userProfile.set(turnContext, userProfile);
                //             await this.userState.saveChanges(turnContext);
                //             await turnContext.sendActivity(`Your Flexible holiday has been updated`);
                //         }
                //         else if (userProfile.flexibleHolidayCount >= 3) {
                //             await turnContext.sendActivity(`You already have avail all the flexible holidays`);
                //         }
                //         else {
                //             await turnContext.sendActivity(`You already have avail this flexible holiday`);
                //         }
                //     }
                // } else{
                //     switch(topIntent.intent){
                //         case 'PublicHoldiayIntent':
                //             await turnContext.sendActivity({
                //                 text: 'Nagarro Leave Management',
                //                 attachments: [CardFactory.adaptiveCard(holidayCard)]
                //             });
                //             break;
                //         case 'FlexibleHolidayIntent':
                //             await turnContext.sendActivity({
                //                 text: 'Nagarro Leave Management',
                //                 attachments: [CardFactory.heroCard(
                //                     'Flexible Holidays List',
                //                     undefined,
                //                     FlexibleHolidayList
                //                 )]
                //             });
                //             break;
                //         case 'SubmittedRequestIntent':
                //             if(results.luisResult.entities){
                //                 if(results.luisResult.entities.find(e=> e.entity.toLowerCase() === 'flexibles')){
                //                     SampleHeroCardSchema.body[0].text = 'Your taken Flexible Holidays 2019';
                //                     SampleHeroCardSchema.body[1].columns[0].items = [];
                //                     userProfile.takenFlexibleHolidays.forEach(takenFlexibleHoliday => {
                //                     SampleHeroCardSchema.body[1].columns[0].items.push(
                //                             {
                //                                 "type": "TextBlock",
                //                                 "text": takenFlexibleHoliday.title
                //                             }
                //                         )   
                //                     });

                //                     await turnContext.sendActivity({
                //                         text: 'Nagarro Leave Management',
                //                         attachments: [CardFactory.adaptiveCard(SampleHeroCardSchema)]
                //                     });
                //                 }
                //             }else if (results.luisResult.entities.find(e=> e.entity.toLowerCase() !== 'flexibles')){
                //                 SampleHeroCardSchema.body[0].text = 'Your taken Casual Leaves 2019';
                //                 SampleHeroCardSchema.body[1].columns[0].items = [];
                //                 userProfile.takenCasualLeaves.forEach(takenCasualLeave => {
                //                 SampleHeroCardSchema.body[1].columns[0].items.push(
                //                         {
                //                             "type": "TextBlock",
                //                             "text": takenCasualLeave.value
                //                         }
                //                     )
                //                 });

                //                 await turnContext.sendActivity({
                //                     text: 'Nagarro Leave Management',
                //                     attachments: [CardFactory.adaptiveCard(SampleHeroCardSchema)]
                //                 });
                //             } else {
                //                 SampleHeroCardSchema.body[0].text = 'Your taken  Leaves 2019';
                //                 SampleHeroCardSchema.body[1].columns[0].items = [];
                //                 userProfile.takenFlexibleHolidays.forEach(takenFlexibleHoliday => {
                //                     SampleHeroCardSchema.body[1].columns[0].items.push(
                //                             {
                //                                 "type": "TextBlock",
                //                                 "text": takenFlexibleHoliday.title
                //                             }
                //                         )   
                //                     });
                //                 userProfile.takenCasualLeaves.forEach(takenCasualLeave => {
                //                 SampleHeroCardSchema.body[1].columns[0].items.push(
                //                         {
                //                             "type": "TextBlock",
                //                             "text": takenCasualLeave.value
                //                         }
                //                     )
                //                 });

                //                 await turnContext.sendActivity({
                //                     text: 'Nagarro Leave Management',
                //                     attachments: [CardFactory.adaptiveCard(SampleHeroCardSchema)]
                //                 });
                //             }
                //         break;
                //         case 'LeaveRequestIntent':
                //             const isLeaveDateGiven = results.luisResult.entities[0].resolution.values[1];
                //             if(isLeaveDateGiven){
                //                 if(isLeaveDateGiven.value){
                //                     if (userProfile.casualLeavesCount < 27 && (userProfile.takenCasualLeaves.filter(takenCasualLeave => takenCasualLeave.value === isLeaveDateGiven.value).length <= 0)) {
                //                         userProfile.casualLeavesCount++;
                //                         userProfile.takenCasualLeaves.push({ value: isLeaveDateGiven.value});
                //                         await this.userProfile.set(turnContext, userProfile);
                //                         await this.userState.saveChanges(turnContext);
                //                         await turnContext.sendActivity(`Your Casual holiday has been updated`);
                //                     }
                //                     else if (userProfile.casualLeavesCount >= 27) {
                //                         await turnContext.sendActivity(`You already have avail all the Casual Leaves`);
                //                     }
                //                     else {
                //                         await turnContext.sendActivity(`You already have avail this Leave `);
                //                     }
                //                 }
                //                 else
                //                 {
                //                     const dates=getDates(new Date(isLeaveDateGiven.start),new Date(isLeaveDateGiven.end));
                                    
                //                 }
                //             }
                //         break;
                //         case 'GreetingIntent': 
                //         case 'None':
                //         default: 
                //             await new WelcomeUserBot().onTurn(turnContext);
                //         break;
                //     }
                // }
                
                if (turnContext.activity.text === 'List all Holidays') {
                    await turnContext.sendActivity({
                        text: 'Nagarro Leave Management',
                        attachments: [CardFactory.adaptiveCard(holidayCard)]
                    });
                } else if (turnContext.activity.text === 'List all Flexible Holidays') {
                    await turnContext.sendActivity({
                        text: 'Nagarro Leave Management',
                        attachments: [CardFactory.heroCard(
                            'Flexible Holidays List',
                            undefined,
                            FlexibleHolidayList
                        )]
                    });
                } else if (FlexibleHolidayList.filter(FlexibleHoliday => FlexibleHoliday.value === turnContext.activity.text).length >= 1) {
                    if (userProfile.flexibleHolidayCount < 3 && (userProfile.takenFlexibleHolidays.filter(takenFlexibleHoliday => takenFlexibleHoliday.value === turnContext.activity.text).length <= 0)) {
                        userProfile.flexibleHolidayCount++;
                        userProfile.takenFlexibleHolidays.push(FlexibleHolidayList.find(FlexibleHoliday => FlexibleHoliday.value === turnContext.activity.text));
                        await this.userProfile.set(turnContext, userProfile);
                        await this.userState.saveChanges(turnContext);
                        await turnContext.sendActivity(`Your Flexible holiday has been updated`);
                    }
                    else if (userProfile.flexibleHolidayCount >= 3) {
                        await turnContext.sendActivity(`You already have avail all the flexible holidays`);
                    }
                    else {
                        await turnContext.sendActivity(`You already have avail this flexible holiday`);
                    }
                } else if (turnContext.activity.text.startsWith('I want to take a leave')) {
                    if (userProfile.casualLeavesCount < 27 && (userProfile.takenCasualLeaves.filter(takenCasualLeave => takenCasualLeave.value === turnContext.activity.text.split('I want to take a leave')[1].trim()).length <= 0)) {
                        userProfile.casualLeavesCount++;
                        userProfile.takenCasualLeaves.push({ value: turnContext.activity.text.split('I want to take a leave')[1].trim() });
                        await this.userProfile.set(turnContext, userProfile);
                        await this.userState.saveChanges(turnContext);
                        await turnContext.sendActivity(`Your Casual holiday has been updated`);
                    }
                    else if (userProfile.casualLeavesCount >= 27) {
                        await turnContext.sendActivity(`You already have avail all the Casual Leaves`);
                    }
                    else {
                        await turnContext.sendActivity(`You already have avail this Leave `);
                    }
                } else if (turnContext.activity.text === 'Show taken Flexible Holidays') {
                    SampleHeroCardSchema.body[0].text = 'Your taken Flexible Holidays 2019';
                    SampleHeroCardSchema.body[1].columns[0].items = [];
                    userProfile.takenFlexibleHolidays.forEach(takenFlexibleHoliday => {
                        SampleHeroCardSchema.body[1].columns[0].items.push(
                            {
                                "type": "TextBlock",
                                "text": takenFlexibleHoliday.title
                            }
                        )
                    });

                    await turnContext.sendActivity({
                        text: 'Nagarro Leave Management',
                        attachments: [CardFactory.adaptiveCard(SampleHeroCardSchema)]
                    });
                } else if (turnContext.activity.text === 'Show taken Casual Leaves') {
                    SampleHeroCardSchema.body[0].text = 'Your taken Casual Leaves 2019';
                    SampleHeroCardSchema.body[1].columns[0].items = [];
                    userProfile.takenCasualLeaves.forEach(takenCasualLeave => {
                        SampleHeroCardSchema.body[1].columns[0].items.push(
                            {
                                "type": "TextBlock",
                                "text": takenCasualLeave.value
                            }
                        )
                    });

                    await turnContext.sendActivity({
                        text: 'Nagarro Leave Management',
                        attachments: [CardFactory.adaptiveCard(SampleHeroCardSchema)]
                    });
                } else if (turnContext.activity.text === 'specific leave'){
                    await dc.beginDialog(CASUAL_LEAVE_DIALOG);
                } else {
                    await turnContext.sendActivity(`You said '${turnContext.activity.text}'`);
                }
            } else {
                const dialogTurnResult = await dc.continueDialog();
                if (dialogTurnResult.status === DialogTurnStatus.complete) {
                    const leaveDate = dialogTurnResult.result.date;
                    console.log(leaveDate);
                    // Send a confirmation message to the user.
                    await turnContext.sendActivity(`Leave Updated '${leaveDate}'`);
                }
            }
            await this.conversationState.saveChanges(turnContext,false);
        } else if (turnContext.activity.type === ActivityTypes.ConversationUpdate &&
            turnContext.activity.recipient.id !== turnContext.activity.membersAdded[0].id) {
            const welcomeUserBot = new WelcomeUserBot();
            // Send greeting when users are added to the conversation.
            await welcomeUserBot.onTurn(turnContext);
        }
    }
}

module.exports.LeaveManagementBot = LeaveManagementBot;
