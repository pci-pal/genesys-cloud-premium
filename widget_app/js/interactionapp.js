/*
 * NOTE: This sample use ES6
 */

const clientId = '4e16b9b5-7630-4828-a5e5-73aef722f6e1';
const redirectUri = 'https://pci-pal.github.io/genesys-cloud-premium/widget_app/interactionapp.html';

// PureCloud Platform API
const platformClient = require('platformClient');
const client = platformClient.ApiClient.instance;
client.setPersistSettings(true, 'InteractionApp');

// Specific Platform API Instances
const usersApi = new platformClient.UsersApi();
const notificationsApi = new platformClient.NotificationsApi();
const conversationsApi = new platformClient.ConversationsApi();

var lifecycleStatusMessageTitle = 'Interaction App - Lifecycle Demo';
var lifecycleStatusMessageId = 'lifecycleDemo-statusMsg';
var topicName = "";
var me = null;
var socket = null;
var PCIPalSessionID = null;
var PCIPalBearerToken = null;
var PCIPalRefreshToken = null;

// Parse the query parameters to get the pcEnvironment variable so we can setup
// the API client against the proper Genesys Cloud region.
//
// Note: Genesys Cloud will send us pcEnvironment, pcLangTag, and pcConversationId
//       when the iframe is first initialized.  However, we'll come through this code
//       again after the implicit grant redirect, and those parameters won't be there
//       So we have to check if we were able to parse out the environment or not.
var integrationQueryString = "";
if ( window.location.search.length !== 0 ) {
    integrationQueryString = window.location.search.substring(1);
} else if ( window.location.hash.length !== 0 ) {
    integrationQueryString = window.location.hash.substring(1);
}
var appParams = parseAppParameters(integrationQueryString);

console.log("Initializing platform client for region: " + appParams.pcEnvironment);
client.setEnvironment(appParams.pcEnvironment);

// Create instance of Client App SDK
let myClientApp = new window.purecloud.apps.ClientApp({
    pcEnvironment: appParams.pcEnvironment
});

// Log the PureCloud environment (i.e. AWS Region)
console.log("PureCloud API Client Environment: " + client.environment);
console.log("PureCloud ClientApp Environment: " + myClientApp.pcEnvironment);
console.log("PureCloud ClientApp Version: " + window.purecloud.apps.ClientApp.version);
console.log("PureCloud ClientApp About: " + window.purecloud.apps.ClientApp.about());

document.querySelector("#pcConversationId").innerHTML = appParams.pcConversationId;
document.querySelector("#pcEnvironment").innerHTML = appParams.pcEnvironment;
document.querySelector("#pcLangTag").innerHTML = appParams.pcLangTag;

if ( window.location.hash.length !== 0 ) {
    initializeApplication();
}
//
// Bootstrap Listener
//
myClientApp.lifecycle.addBootstrapListener(() => {
    logLifecycleEvent('App Lifecycle Event: bootstrap', true);
    initializeApplication();
});

//
// Focus Listener
//
function onAppFocus () {
    logLifecycleEvent('App Lifecycle Event: focus', true);

    myClientApp.alerting.showToastPopup(
        lifecycleStatusMessageTitle,
        'App Focused', {
            id: lifecycleStatusMessageId
        }
    );
}
myClientApp.lifecycle.addFocusListener(onAppFocus);

//
// Blur Listener
//
function onAppBlur () {
    logLifecycleEvent('App Lifecycle Event: blur', true);

    myClientApp.alerting.showToastPopup(
        lifecycleStatusMessageTitle,
        'App Blurred', {
            id: lifecycleStatusMessageId
        }
    );
}
myClientApp.lifecycle.addBlurListener(onAppBlur);

//
// Stop Listener
//
myClientApp.lifecycle.addStopListener(() => {
    logLifecycleEvent('App Lifecycle Event: stop', true);

    // Clean up other, persistent listeners
    myClientApp.lifecycle.removeFocusListener(onAppFocus);
    myClientApp.lifecycle.removeBlurListener(onAppBlur);

    socket.close(1000, "Application Closing");

    // Simulating delay of 500ms
    window.setTimeout(() => {
        myClientApp.lifecycle.stopped();

        myClientApp.alerting.showToastPopup(
            lifecycleStatusMessageTitle,
            'App Stopped (500ms delay)', {
                id: lifecycleStatusMessageId,
                type: 'error',
                showCloseButton: true
            }
        );

        logLifecycleEvent('Notified PC of Successful App Stop', false);
    }, 500);
});

function logLifecycleEvent(logText, incommingEvent) {
    console.log(logText)
};

// Handler for every Websocket message
function onSocketMessage(event){
    console.log("WebSocket Event Received: " + event.data);
    let data = JSON.parse(event.data);
    let topic = data.topicName;
    let eventBody = data.eventBody;

    if ( topic === topicName && eventBody.id === appParams.pcConversationId ) {
        console.log("Received an event for a Conversation ID that is recognized");
        document.querySelector("#conversationEvent").innerHTML = JSON.stringify(eventBody, null, 3);
    }
};

function initializeApplication() {
    console.log("Performing application bootstrapping");

    // Perform Implicit Grant Authentication
    //
    // Note: Pass the query string parameters in the 'state' parameter so that they are returned
    //       to us after the implicit grant redirect.
    client.loginImplicitGrant(clientId, redirectUri, { state: integrationQueryString })
        .then((data) => {
            // User Authenticated
            console.log("User Authenticated: " + JSON.stringify(data));

            // Make request to GET /api/v2/users/me?expand=presence
            return usersApi.getUsersMe({ 'expand': ["presence","authorization"] });
        })
        .then((userMe) => {
            // Me Response
            me = userMe;

            document.querySelector("#username").innerHTML = me.username;

            // Create a Notifications Channel
            return notificationsApi.postNotificationsChannels();
        }).then((channel) => {
        // Channel Created

        // Setup WebSocket on Channel
        socket = new WebSocket(channel.connectUri);
        socket.onmessage = onSocketMessage;

        topicName = `v2.users.${me.id}.conversations`;

        // Subscribe to conversation events in the queue.
        let topic = [{"id": topicName}];
        return notificationsApi.postNotificationsChannelSubscriptions(channel.id, topic);
    }).then( () => {
        console.log("Getting initial conversation details for conversation ID: " + appParams.pcConversationId);
        return conversationsApi.getConversation(appParams.pcConversationId);
    }).then((data) => {
        console.log("Conversation details for " + appParams.pcConversationId + ": " + JSON.stringify(data));
        document.querySelector("#conversationEvent").innerHTML = JSON.stringify(data, null, 3);

        var customer = data.participants.find(p => {
            console.log("p = " + JSON.stringify(p));
            console.log("p.purpose = " + p.purpose);
            return p.purpose === "customer";
        });

        if (customer != undefined) {
            PCIPalSessionID = customer.attributes.PCIPalSessionID;
            PCIPalBearerToken = customer.attributes.bearer_token;
            PCIPalRefreshToken = customer.attributes.refresh_token;

            console.log("PCIPalCallId set to: " + PCIPalSessionID);
            console.log("PCIPalBearerToken set to: " + PCIPalBearerToken);

            
        } else {
            console.log("Customer participant not found");
        }

        document.getElementById("payment").onclick = takePayment;

        myClientApp.lifecycle.bootstrapped();

        myClientApp.alerting.showToastPopup(
            lifecycleStatusMessageTitle,
            'Bootstrap Complete (500ms delay)', {
                id: lifecycleStatusMessageId,
                type: 'success'
            }
        );

        logLifecycleEvent('Notified PC of Successful App Bootstrap', false);
    }).catch((err) => {
        // Handle failure response
        console.log(err);
    });
}

function takePayment() {
    if (PCIPalSessionID != null) {

        // https://useast1.pcipal.cloud/session/208/view/bef20b9c-8451-4018-96b4-92749345ad00/framed

        var secure_link = "https://useast1.pcipal.cloud/session/208/view/" + PCIPalSessionID + "/framed/";
        console.log("Taking Payment URL is: " + secure_link);

        const form = document.createElement("form");
        form.method = "post";
        form.action = secure_link;

        const hiddenFieldBearer = document.createElement("input");

        hiddenFieldBearer.type = "hidden";
        hiddenFieldBearer.name = "X-BEARER-TOKEN";
        hiddenFieldBearer.value = PCIPalBearerToken;
        form.appendChild(hiddenFieldBearer);

        const hiddenFieldRefresh = document.createElement("input");

        hiddenFieldRefresh.type = "hidden";
        hiddenFieldRefresh.name = "X-REFRESH-TOKEN";
        hiddenFieldRefresh.value = PCIPalRefreshToken;
        form.appendChild(hiddenFieldRefresh);

        document.body.appendChild(form);

        form.submit();

        //window.location.href = secure_link;
        
    } else {
        console.log("Can't build secure link because PCIPalSessionID is null");
    }
}



function parseAppParameters(queryString) {
    console.log("Interaction App Query String: " + queryString);

    let appParams = {
        pcEnvironment: null,
        pcLangTag: null,
        pcConversationId: null
    };


    if ( queryString.length != 0 ) {
        const pairs = queryString.split('&');

        for (var i = 0; i < pairs.length; i++)
        {
            var currParam = pairs[i].split('=');

            if (currParam[0] === 'pcLangTag') {
                appParams.pcLangTag = currParam[1];
            } else if (currParam[0] === 'pcEnvironment') {
                appParams.pcEnvironment = currParam[1];
            } else if (currParam[0] === 'pcConversationId') {
                appParams.pcConversationId = currParam[1];
            } else if (currParam[0] === 'state') {
                console.log("Found 'state' query parameter from implicit grant redirect");
                var stateValue = currParam[1];
                console.log("state = " + stateValue);
                var stateValueDecoded = decodeURIComponent(stateValue);
                console.log("decoded state = " + stateValueDecoded);
                appParams = parseAppParameters(decodeURIComponent(stateValueDecoded));
            }
        }
    }

    return appParams;
};
