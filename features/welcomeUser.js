
const { CardFactory } = require('botbuilder');

// Adaptive Card content
const IntroCard = require('../resources/welcomeCard.json');


class WelcomeUserBot {
    /**
     *
     * @param {UserState} User state to persist boolean flag to indicate
     *                    if the bot had already welcomed the user
     */
    constructor() {
    }
    /**
     *
     * @param {TurnContext} context on turn context object.
     */
    async onTurn(turnContext) {
        await this.sendWelcomeMessage(turnContext);
    }

    /**
     * Sends welcome messages to conversation members when they join the conversation.
     * Messages are only sent to conversation members who aren't the bot.
     * @param {TurnContext} turnContext
     */
    async sendWelcomeMessage(turnContext) {
        await turnContext.sendActivity({
            text: 'Nagarro Leave Management',
            attachments: [CardFactory.adaptiveCard(IntroCard)]
        });
    }
}

module.exports.WelcomeUserBot = WelcomeUserBot;
