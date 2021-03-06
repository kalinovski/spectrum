// @flow
import type { GraphQLContext } from '../../';
import UserError from '../../utils/UserError';
import { isEmail } from 'validator';
import { sendCommunityInviteNotificationQueue } from 'shared/bull/queues';
import {
  isAuthedResolver as requireAuth,
  canModerateCommunity,
} from '../../utils/permissions';
import { events } from 'shared/analytics';
import { trackQueue } from 'shared/bull/queues';

type Contact = {
  email: string,
  firstName?: ?string,
  lastName?: ?string,
};

type Input = {
  input: {
    id: string,
    contacts: Array<Contact>,
    customMessage?: ?string,
  },
};

export default requireAuth(async (_: any, args: Input, ctx: GraphQLContext) => {
  const { input, input: { id: communityId } } = args;
  const { user: currentUser, loaders } = ctx;

  if (!await canModerateCommunity(currentUser.id, communityId, loaders)) {
    trackQueue.add({
      userId: currentUser.id,
      event: events.COMMUNITY_EMAIL_INVITE_SENT_FAILED,
      context: { communityId },
      properties: {
        reason: 'no permission',
      },
    });

    return new UserError(
      "You don't have permission to invite people to this community."
    );
  }

  return input.contacts
    .filter(user => user.email !== currentUser.email)
    .filter(user => user && user.email && isEmail(user.email))
    .map(user => {
      trackQueue.add({
        userId: currentUser.id,
        event: events.COMMUNITY_EMAIL_INVITE_SENT,
        context: { communityId },
      });

      return sendCommunityInviteNotificationQueue.add({
        recipient: {
          email: user.email,
          firstName: user.firstName ? user.firstName : null,
          lastName: user.lastName ? user.lastName : null,
        },
        communityId: input.id,
        senderId: currentUser.id,
        customMessage: input.customMessage ? input.customMessage : null,
      });
    });
});
