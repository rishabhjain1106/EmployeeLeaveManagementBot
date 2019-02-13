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
       date=getDateString(date);
    }
    
    return FlexibleHolidayList.find(FlexibleHoliday => FlexibleHoliday.value === date) === undefined;
}
const getDateString=function(date){
    return date =date.getFullYear()+'-'+date.getMonth()+'-'+date.getDate();
}
const leaveDateValidator =function(userProfile,date){
    const dateStatus={
        isValid:false,
        leaveType:{
            flexible:false,
            casual:true,
            weekend:true,
            flexibleCountReached:userProfile.flexibleHolidayCount < 3,
            casualCountReached:userProfile.casualLeavesCount < 27,
            thisDateAlreadyAvailed:false
        }
    }
    if(date.constructor !== Date){
        date=new Date(date);
    }
    if(date.getDay() !== 0 && date.getDay() !== 6){
        dateStatus.leaveType.flexible=checkIfDateIsFlexible(date);
        dateStatus.leaveType.weekend=false;
        if(dateStatus.leaveType.flexible){
            dateStatus.leaveType.thisDateAlreadyAvailed=userProfile.takenFlexibleHolidays.filter(takenFlexibleHoliday => takenFlexibleHoliday.value === getDateString(date)).length <= 0;
            dateStatus.isValid = !dateStatus.leaveType.flexibleCountReached && !dateStatus.leaveType.thisDateAlreadyAvailed;
        } else {
            dateStatus.leaveType.thisDateAlreadyAvailed=userProfile.takenCasualLeaves.filter(takenCasualLeave => takenCasualLeave.value === getDateString(date)).length <= 0;
            dateStatus.isValid = !dateStatus.leaveType.casualCountReached && !dateStatus.leaveType.thisDateAlreadyAvailed;
        }
        
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
                if(isPostBack){
                    if (checkIfDateIsFlexible(turnContext.activity.text)) {
                        if (userProfile.flexibleHolidayCount < 3 && (userProfile.takenFlexibleHolidays.filter(takenFlexibleHoliday => takenFlexibleHoliday.value === turnContext.activity.text).length <= 0)) {
                            userProfile.flexibleHolidayCount++;
                            userProfile.takenFlexibleHolidays.push(turnContext.activity.text);
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
                    }
                } else{
                    switch(topIntent.intent){
                        case 'PublicHoldiayIntent':
                            await turnContext.sendActivity({
                                text: 'Nagarro Leave Management',
                                attachments: [CardFactory.adaptiveCard(holidayCard)]
                            });
                            break;
                        case 'FlexibleHolidayIntent':
                            await turnContext.sendActivity({
                                text: 'Nagarro Leave Management',
                                attachments: [CardFactory.heroCard(
                                    'Flexible Holidays List',
                                    undefined,
                                    FlexibleHolidayList
                                )]
                            });
                            break;
                        case 'SubmittedRequestIntent':
                            if(results.luisResult.entities){
                                if(results.luisResult.entities.find(e=> e.entity.toLowerCase() === 'flexibles')){
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
                                }
                            }else if (results.luisResult.entities.find(e=> e.entity.toLowerCase() !== 'flexibles')){
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
                            } else {
                                SampleHeroCardSchema.body[0].text = 'Your taken  Leaves 2019';
                                SampleHeroCardSchema.body[1].columns[0].items = [];
                                userProfile.takenFlexibleHolidays.forEach(takenFlexibleHoliday => {
                                    SampleHeroCardSchema.body[1].columns[0].items.push(
                                            {
                                                "type": "TextBlock",
                                                "text": takenFlexibleHoliday.title
                                            }
                                        )   
                                    });
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
                            }
                        break;
                        case 'LeaveRequestIntent':
                            
                            //console.log(results.luisResult.entities[0].resolution);
                            if(results.luisResult.entities[0]){
                                const isLeaveDateGiven = results.luisResult.entities[0].resolution.values;
                                if(isLeaveDateGiven.length >= 1 && isLeaveDateGiven[0].type === 'date'){
                                    const dateStatus=leaveDateValidator(userProfile,isLeaveDateGiven[isLeaveDateGiven.length-1].value);
                                    if(dateStatus.leaveType.weekend){
                                        await turnContext.sendActivity(`sorry you enter the date which is weekend `);
                                    }
                                    else if(dateStatus.leaveType.flexible){
                                        if(dateStatus.isValid){
                                            userProfile.flexibleHolidayCount++;
                                            userProfile.takenFlexibleHolidays.push(isLeaveDateGiven[isLeaveDateGiven.length-1].value);
                                            await this.userProfile.set(turnContext, userProfile);
                                            await this.userState.saveChanges(turnContext);
                                            await turnContext.sendActivity(`Your Flexible holiday has been updated`);
                                        }
                                        else{
                                            if(dateStatus.leaveType.flexibleCountReached){
                                                await turnContext.sendActivity(`You already have availed all Flexible Leaves `);
                                            }
                                            else if (dateStatus.leaveType.thisDateAlreadyAvailed){
                                                await turnContext.sendActivity(`You already have availed this Leave `);
                                            }
                                            else{
                                                await turnContext.sendActivity(`sorry can't process `);
                                            }
                                        }
                                    }
                                    else if(dateStatus.leaveType.casual){
                                        if(dateStatus.isValid){
                                            userProfile.casualLeavesCount++;
                                            userProfile.takenCasualLeaves.push({ value: isLeaveDateGiven[isLeaveDateGiven.length-1].value});
                                            await this.userProfile.set(turnContext, userProfile);
                                            await this.userState.saveChanges(turnContext);
                                            await turnContext.sendActivity(`Your Casual holiday has been updated`);
                                        }
                                        else{
                                            if(dateStatus.leaveType.casualCountReached){
                                                await turnContext.sendActivity(`You already have availed all Casual Leaves `);
                                            }
                                            else if (dateStatus.leaveType.thisDateAlreadyAvailed){
                                                await turnContext.sendActivity(`You already have availed this Leave `);
                                            }
                                            else{
                                                await turnContext.sendActivity(`sorry can't process `);
                                            }
                                        }
                                    }
                                    else
                                    {
                                        await turnContext.sendActivity(`sorry can't process `);
                                    }
                                }
                                else
                                {
                                    const dates=getDates(new Date(isLeaveDateGiven[isLeaveDateGiven.length-1].start),new Date(isLeaveDateGiven[isLeaveDateGiven.length-1].end));
                                    dates.forEach(date =>{
                                        date=getDateString(date);
                                        const dateStatus=leaveDateValidator(userProfile,date);
                                        if(dateStatus.leaveType.flexible){
                                            if(dateStatus.isValid){
                                                userProfile.flexibleHolidayCount++;
                                                userProfile.takenFlexibleHolidays.push(date);
                                            }
                                        }
                                        else if(dateStatus.leaveType.casual){
                                            if(dateStatus.isValid){
                                                userProfile.casualLeavesCount++;
                                                userProfile.takenCasualLeaves.push({ value: date});
                                            }
                                        }
                                    });
                                    await this.userProfile.set(turnContext, userProfile);
                                    await this.userState.saveChanges(turnContext);
                                    await turnContext.sendActivity(`Your  holidays has been updated`);
                                    
                                }
                            }
                            else{
                                await dc.beginDialog(CASUAL_LEAVE_DIALOG);
                            }
                        break;
                        case 'GreetingIntent': 
                        case 'None':
                        default: 
                            await new WelcomeUserBot().onTurn(turnContext);
                        break;
                    }
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
