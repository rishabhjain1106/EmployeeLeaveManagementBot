const { ActionTypes } = require('botbuilder');
const SampleHeroCardSchema={
    "type": "AdaptiveCard",
    "body": [
        {
            "type": "TextBlock",
            "horizontalAlignment": "Center",
            "size": "Medium",
            "weight": "Bolder",
            "color": "Dark",
            "text": "Taken Flexible Leaves 2019"
        },
        {
            "type": "ColumnSet",
            "columns": [
                {
                    "type": "Column",
                    "items": [
                        {
                            "type": "TextBlock",
                            "text": "New TextBlock"
                        }
                    ],
                    "width": "stretch"
                }
            ]
        }
    ],
    "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
    "version": "1.0"
};
const FlexibleHolidayList = [{
    type: ActionTypes.PostBack,
    title: 'Monday 14-Jan Makar Sakranti',
    value: '2019-01-14'
},
{
    type: ActionTypes.PostBack,
    title: 'Tuesday 15-Jan Pongal',
    value: '2019-01-15'
},
                                                {
   type: ActionTypes.PostBack,
    title: 'Monday 04-Mar Maha Shivratari',
    value: '2019-03-04'
},
{
    type: ActionTypes.PostBack,
    title: 'Friday 19-Apr Good Friday',
    value: '2019-04-19'
},
                                                {
    type: ActionTypes.PostBack,
    title: 'Friday 24-May Nagarro\'s Day of Reason',
    value: '2019-05-24'
},
{
    type: ActionTypes.PostBack,
    title: 'Wednesday 05-Jun Id Ul Fitr',
    value: '2019-06-05'
},
                                                {
    type: ActionTypes.PostBack,
    title: 'Monday 12-Aug Id Ul Juha',
    value: '2019-08-12'
},
{
    type: ActionTypes.PostBack,
    title: 'Monday 02-Sep Ganesh Chaturthi',
    value: '2019-09-02'
},{
    type: ActionTypes.PostBack,
    title: 'Wednesday 11-Sep Onam',
    value: '2019-09-11'
},
{
    type: ActionTypes.PostBack,
    title: 'Tuesday 29-Oct Bhai Dooj',
    value: '2019-09-29'
},
{
    type: ActionTypes.PostBack,
    title: "Tuesday 12-Nov Guru Nanak Jayanti",
    value: "2019-11-12"
}
];

module.exports = {
    SampleHeroCardSchema:SampleHeroCardSchema,
    FlexibleHolidayList:FlexibleHolidayList
}