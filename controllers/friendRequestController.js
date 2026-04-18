import FriendRequest from '../models/FriendRequest.js';
import User from '../models/User.js';
import { validationResult } from 'express-validator';
import { createNotification } from './notificationController.js';

// Get users near you based on location
export const getUsersNearYou = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20 } = req.query;

    // Get current user with address
    const currentUser = await User.findById(userId).select('address').lean();
    
    if (!currentUser || !currentUser.address) {
      return res.status(200).json({
        success: true,
        message: 'Please update your address in profile to discover people near you',
        data: []
      });
    }

    const userAddress = currentUser.address;
    if (!userAddress.district && !userAddress.state && !userAddress.country && !userAddress.pinCode) {
      return res.status(200).json({
        success: true,
        message: 'Please update your address in profile to discover people near you',
        data: []
      });
    }

    // Get current user's friends (accepted requests) - optimized with lean()
    const userFriends = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    }).select('fromUser toUser').lean();

    const friendIds = new Set();
    friendIds.add(userId.toString()); // Add self
    userFriends.forEach(fr => {
      if (fr.fromUser.toString() === userId.toString()) {
        friendIds.add(fr.toUser.toString());
      } else {
        friendIds.add(fr.fromUser.toString());
      }
    });

    // Get pending requests (sent or received) - optimized with lean()
    const pendingRequests = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'pending' },
        { toUser: userId, status: 'pending' }
      ]
    }).select('fromUser toUser').lean();

    const pendingIds = new Set();
    pendingRequests.forEach(fr => {
      if (fr.fromUser.toString() === userId.toString()) {
        pendingIds.add(fr.toUser.toString());
      } else {
        pendingIds.add(fr.fromUser.toString());
      }
    });

    // Get following (one-way + mutual follows for public accounts)
    const following = await FriendRequest.find({
      fromUser: userId,
      $or: [
        { status: 'following' },
        { status: 'accepted' }
      ]
    }).select('toUser').lean();

    const followingIds = new Set();
    following.forEach(fr => {
      followingIds.add(fr.toUser.toString());
    });

    // Get all excluded IDs (friends + pending + following + self)
    const excludedIds = [...friendIds, ...pendingIds, ...followingIds];

    // Build location query - prioritize by proximity
    const locationQuery = {
      _id: { $nin: excludedIds },
      role: 'user',
      isActive: true,
      address: { $exists: true, $ne: null }
    };

    // Build location conditions with priority
    const locationConditions = [];
    
    // Priority 1: Same pinCode
    if (userAddress.pinCode) {
      locationConditions.push({
        'address.pinCode': userAddress.pinCode.trim()
      });
    }
    
    // Priority 2: Same district
    if (userAddress.district) {
      locationConditions.push({
        'address.district': { $regex: new RegExp(`^${userAddress.district.trim()}$`, 'i') }
      });
    }
    
    // Priority 3: Same state
    if (userAddress.state) {
      locationConditions.push({
        'address.state': { $regex: new RegExp(`^${userAddress.state.trim()}$`, 'i') }
      });
    }
    
    // Priority 4: Same country
    if (userAddress.country) {
      locationConditions.push({
        'address.country': { $regex: new RegExp(`^${userAddress.country.trim()}$`, 'i') }
      });
    }

    if (locationConditions.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Please update your address in profile to discover people near you',
        data: []
      });
    }

    locationQuery.$or = locationConditions;

    // Find users near you
    const nearbyUsers = await User.find(locationQuery)
      .select('name email profileImage accountType onlineStatus lastSeen privacySettings subscription address')
      .limit(parseInt(limit) * 2) // Get more to sort by priority
      .lean();

    // Sort by proximity priority
    const sortedUsers = nearbyUsers.sort((a, b) => {
      const aAddress = a.address || {};
      const bAddress = b.address || {};
      
      // Priority scoring: higher score = closer
      let aScore = 0;
      let bScore = 0;
      
      // Same pinCode = 4 points
      if (userAddress.pinCode && aAddress.pinCode && 
          aAddress.pinCode.trim().toLowerCase() === userAddress.pinCode.trim().toLowerCase()) aScore += 4;
      if (userAddress.pinCode && bAddress.pinCode && 
          bAddress.pinCode.trim().toLowerCase() === userAddress.pinCode.trim().toLowerCase()) bScore += 4;
      
      // Same district = 3 points
      if (userAddress.district && aAddress.district && 
          aAddress.district.trim().toLowerCase() === userAddress.district.trim().toLowerCase()) aScore += 3;
      if (userAddress.district && bAddress.district && 
          bAddress.district.trim().toLowerCase() === userAddress.district.trim().toLowerCase()) bScore += 3;
      
      // Same state = 2 points
      if (userAddress.state && aAddress.state && 
          aAddress.state.trim().toLowerCase() === userAddress.state.trim().toLowerCase()) aScore += 2;
      if (userAddress.state && bAddress.state && 
          bAddress.state.trim().toLowerCase() === userAddress.state.trim().toLowerCase()) bScore += 2;
      
      // Same country = 1 point
      if (userAddress.country && aAddress.country && 
          aAddress.country.trim().toLowerCase() === userAddress.country.trim().toLowerCase()) aScore += 1;
      if (userAddress.country && bAddress.country && 
          bAddress.country.trim().toLowerCase() === userAddress.country.trim().toLowerCase()) bScore += 1;
      
      return bScore - aScore; // Sort descending
    }).slice(0, parseInt(limit)); // Limit to requested amount

    res.status(200).json({
      success: true,
      data: sortedUsers
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users near you',
      error: error.message
    });
  }
};

// Get user suggestions (show both public and private accounts)
export const getUserSuggestions = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20 } = req.query;

    // Get current user's friends (accepted requests) - optimized with lean()
    const userFriends = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    }).select('fromUser toUser').lean();

    const friendIds = new Set();
    friendIds.add(userId.toString()); // Add self
    userFriends.forEach(fr => {
      if (fr.fromUser.toString() === userId.toString()) {
        friendIds.add(fr.toUser.toString());
      } else {
        friendIds.add(fr.fromUser.toString());
      }
    });

    // Get pending requests (sent or received) - optimized with lean()
    const pendingRequests = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'pending' },
        { toUser: userId, status: 'pending' }
      ]
    }).select('fromUser toUser').lean();

    const pendingIds = new Set();
    pendingRequests.forEach(fr => {
      if (fr.fromUser.toString() === userId.toString()) {
        pendingIds.add(fr.toUser.toString());
      } else {
        pendingIds.add(fr.fromUser.toString());
      }
    });

    // Get following (one-way + mutual follows for public accounts)
    const following = await FriendRequest.find({
      fromUser: userId,
      $or: [
        { status: 'following' },
        { status: 'accepted' }
      ]
    }).select('toUser').lean();

    const followingIds = new Set();
    following.forEach(fr => {
      followingIds.add(fr.toUser.toString());
    });

    // Get all excluded IDs (friends + pending + following + self)
    const excludedIds = [...friendIds, ...pendingIds, ...followingIds];

    // Show both public and private accounts that are not already friends/following/pending
    const suggestions = await User.find({
      _id: { $nin: excludedIds },
      role: 'user',
      isActive: true
    })
      .select('name email profileImage bio accountType onlineStatus lastSeen privacySettings subscription')
      .limit(parseInt(limit))
      .sort({ createdAt: -1 })
      .lean(); // Use lean() for faster queries

    res.status(200).json({
      success: true,
      data: suggestions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user suggestions',
      error: error.message
    });
  }
};

// Send friend request
export const sendFriendRequest = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { toUserId } = req.body;
    const fromUserId = req.user._id;

    if (fromUserId.toString() === toUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send friend request to yourself'
      });
    }

    // Check if users exist and account type
    const toUser = await User.findById(toUserId).select('accountType role isActive').lean();
    if (!toUser || toUser.role === 'admin' || !toUser.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // For public accounts, use follow instead of friend request
    if (toUser.accountType === 'public') {
      return res.status(400).json({
        success: false,
        message: 'This user has a public account. Use the follow endpoint instead.'
      });
    }

    // Check if already friends - optimized with lean()
    const existingFriendship = await FriendRequest.findOne({
      $or: [
        { fromUser: fromUserId, toUser: toUserId, status: 'accepted' },
        { fromUser: toUserId, toUser: fromUserId, status: 'accepted' }
      ]
    }).lean();

    if (existingFriendship) {
      return res.status(400).json({
        success: false,
        message: 'Already friends with this user'
      });
    }

    // Check if request already exists - optimized with lean()
    const existingRequest = await FriendRequest.findOne({
      $or: [
        { fromUser: fromUserId, toUser: toUserId },
        { fromUser: toUserId, toUser: fromUserId }
      ]
    }).lean();

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.status(400).json({
          success: false,
          message: existingRequest.fromUser.toString() === fromUserId.toString()
            ? 'Friend request already sent'
            : 'You have a pending request from this user'
        });
      }
      // If rejected/cancelled, create new request
      if (existingRequest.status === 'rejected' || existingRequest.status === 'cancelled') {
        existingRequest.fromUser = fromUserId;
        existingRequest.toUser = toUserId;
        existingRequest.status = 'pending';
        existingRequest.respondedAt = null;
        await existingRequest.save();
      }
    } else {
      // Create new request
      await FriendRequest.create({
        fromUser: fromUserId,
        toUser: toUserId,
        status: 'pending'
      });
    }

    // Create notification for recipient
    await createNotification(
      toUserId,
      'friend_request',
      'New Friend Request',
      `${req.user.name} sent you a friend request`,
      null,
      null,
      `/user/friends`
    );

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to send friend request',
      error: error.message
    });
  }
};

// Accept friend request
export const acceptFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }

    if (request.toUser.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to accept this request'
      });
    }

    if (request.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Friend request is not pending'
      });
    }

    request.status = 'accepted';
    request.respondedAt = new Date();
    await request.save();

    // Create notification for sender
    const _fromUser = await User.findById(request.fromUser);
    await createNotification(
      request.fromUser,
      'friend_request',
      'Friend Request Accepted',
      `${req.user.name} accepted your friend request`,
      null,
      null,
      `/user/chat/${request.fromUser}`
    );

    res.status(200).json({
      success: true,
      message: 'Friend request accepted',
      data: request
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to accept friend request',
      error: error.message
    });
  }
};

// Reject friend request
export const rejectFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }

    if (request.toUser.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to reject this request'
      });
    }

    request.status = 'rejected';
    request.respondedAt = new Date();
    await request.save();

    res.status(200).json({
      success: true,
      message: 'Friend request rejected',
      data: request
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to reject friend request',
      error: error.message
    });
  }
};

// Cancel friend request
export const cancelFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user._id;

    const request = await FriendRequest.findById(requestId);

    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found'
      });
    }

    if (request.fromUser.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to cancel this request'
      });
    }

    request.status = 'cancelled';
    request.respondedAt = new Date();
    await request.save();

    res.status(200).json({
      success: true,
      message: 'Friend request cancelled',
      data: request
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to cancel friend request',
      error: error.message
    });
  }
};

// Get friend requests (sent and received)
export const getFriendRequests = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type = 'received' } = req.query; // 'sent' or 'received'

    let query = {};
    if (type === 'sent') {
      query = { fromUser: userId, status: 'pending' };
    } else {
      query = { toUser: userId, status: 'pending' };
    }

    const requests = await FriendRequest.find(query)
      .populate(type === 'sent' ? 'toUser' : 'fromUser', 'name email profileImage accountType onlineStatus lastSeen')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: requests
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch friend requests',
      error: error.message
    });
  }
};

// Get user's friends list
export const getUserFriends = async (req, res) => {
  try {
    const userId = req.user._id;

    // Friends = mutual follows (status 'accepted')
    // Since mutual follows create two records (one each direction), we need to deduplicate
    const friendships = await FriendRequest.find({
      $or: [
        { fromUser: userId, status: 'accepted' },
        { toUser: userId, status: 'accepted' }
      ]
    })
      .populate('fromUser', 'name email profileImage accountType onlineStatus lastSeen subscription')
      .populate('toUser', 'name email profileImage accountType onlineStatus lastSeen subscription')
      .sort({ updatedAt: -1 })
      .lean();

    // Deduplicate friends (mutual follows create two records)
    const friendsMap = new Map();
    friendships.forEach(fr => {
      // Get the friend (the other user)
      const friend = fr.fromUser._id.toString() === userId.toString() ? fr.toUser : fr.fromUser;
      
      // Handle case where friend might be an ObjectId (if populate failed)
      if (!friend || !friend._id) {
        return; // Skip if friend data is missing
      }
      
      const friendId = friend._id.toString();
      
      // Only add if not already in map (avoid duplicates from mutual follow records)
      if (!friendsMap.has(friendId)) {
        friendsMap.set(friendId, {
          _id: friend._id,
          name: friend.name,
          email: friend.email,
          profileImage: friend.profileImage,
          accountType: friend.accountType,
          onlineStatus: friend.onlineStatus,
          lastSeen: friend.lastSeen,
          privacySettings: friend.privacySettings || {
            hideLastSeen: false,
            hideOnlineStatus: false
          },
          subscription: friend.subscription || {
            badgeType: null,
            subscriptionId: null
          },
          friendshipId: fr._id
        });
      }
    });

    const friends = Array.from(friendsMap.values());

    res.status(200).json({
      success: true,
      data: friends
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch friends',
      error: error.message
    });
  }
};

// Follow user (for public accounts)
export const followUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    if (currentUserId.toString() === targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot follow yourself'
      });
    }

    const targetUser = await User.findById(targetUserId).select('accountType role isActive').lean();
    if (!targetUser || targetUser.role === 'admin' || !targetUser.isActive) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if already friends (mutual follow) - check this first
    const existingFriendship = await FriendRequest.findOne({
      $or: [
        { fromUser: currentUserId, toUser: targetUserId, status: 'accepted' },
        { fromUser: targetUserId, toUser: currentUserId, status: 'accepted' }
      ]
    }).lean();

    if (existingFriendship) {
      return res.status(200).json({
        success: true,
        message: 'Already friends with this user',
        data: existingFriendship,
        alreadyFriends: true
      });
    }

    // Instagram logic: Check if target user is already following you (mutual follow = friends)
    // This handles the case when someone follows you back
    const reverseFollow = await FriendRequest.findOne({
      fromUser: targetUserId,
      toUser: currentUserId,
      status: 'following'
    }).lean();

    // Also check if you're already following them (one-way)
    const existingFollow = await FriendRequest.findOne({
      fromUser: currentUserId,
      toUser: targetUserId,
      status: 'following'
    }).lean();

    if (reverseFollow) {
      // Target user is already following you - convert to mutual friends
      // Update their follow to accepted
      await FriendRequest.updateOne(
        { _id: reverseFollow._id },
        { status: 'accepted', respondedAt: new Date() }
      );

      // Check if you already have a follow record, if so update it, otherwise create new
      let friendship;
      if (existingFollow) {
        // Update existing follow to accepted
        await FriendRequest.updateOne(
          { _id: existingFollow._id },
          { status: 'accepted', respondedAt: new Date() }
        );
        // Get the updated record
        friendship = await FriendRequest.findById(existingFollow._id).lean();
      } else {
        // Create your follow as accepted (mutual friendship)
        // Check if record already exists (shouldn't, but just in case)
        const existingRecord = await FriendRequest.findOne({
          fromUser: currentUserId,
          toUser: targetUserId
        }).lean();
        
        if (existingRecord) {
          // Update existing record to accepted
          await FriendRequest.updateOne(
            { _id: existingRecord._id },
            { status: 'accepted', respondedAt: new Date() }
          );
          friendship = await FriendRequest.findById(existingRecord._id).lean();
        } else {
          // Create new record
          friendship = await FriendRequest.create({
            fromUser: currentUserId,
            toUser: targetUserId,
            status: 'accepted',
            respondedAt: new Date()
          });
        }
      }

      // Create notification for target user
      await createNotification(
        targetUserId,
        'friend_request',
        'New Friend',
        `${req.user.name} followed you back - you're now friends!`,
        null,
        null,
        `/user/profile`
      );

      res.status(201).json({
        success: true,
        message: 'You are now friends!',
        data: friendship,
        isMutualFollow: true
      });
    } else if (existingFollow) {
      // Idempotent: already following - return success so client can refetch state
      return res.status(200).json({
        success: true,
        message: 'Already following this user',
        data: existingFollow,
        alreadyFollowing: true
      });
    } else {
      // Create new follow relationship (one-way)
      const follow = await FriendRequest.create({
        fromUser: currentUserId,
        toUser: targetUserId,
        status: 'following'
      });

      // Create notification for target user
      await createNotification(
        targetUserId,
        'follow',
        'New Follower',
        `${req.user.name} started following you`,
        null,
        null,
        `/user/profile`
      );

      res.status(201).json({
        success: true,
        message: 'Followed successfully',
        data: follow,
        isMutualFollow: false
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to follow user',
      error: error.message
    });
  }
};

// Unfollow user
export const unfollowUser = async (req, res) => {
  try {
    const { userId: targetUserId } = req.params;
    const currentUserId = req.user._id;

    // Check if it's a mutual follow (friends - both have 'accepted' status)
    const yourFriendship = await FriendRequest.findOne({
      fromUser: currentUserId,
      toUser: targetUserId,
      status: 'accepted'
    });

    const theirFriendship = await FriendRequest.findOne({
      fromUser: targetUserId,
      toUser: currentUserId,
      status: 'accepted'
    });

    if (yourFriendship && theirFriendship) {
      // Mutual follow (friends) - convert back to one-way
      // Delete your 'accepted' record
      await FriendRequest.deleteOne({ _id: yourFriendship._id });
      // Convert their 'accepted' back to 'following' (they still follow you)
      await FriendRequest.updateOne(
        { _id: theirFriendship._id },
        { status: 'following', respondedAt: null }
      );
      return res.status(200).json({
        success: true,
        message: 'Unfollowed successfully'
      });
    }

    if (yourFriendship) {
      // Only one direction was 'accepted' (inconsistent state) - still remove ours
      await FriendRequest.deleteOne({ _id: yourFriendship._id });
      if (theirFriendship) {
        await FriendRequest.updateOne(
          { _id: theirFriendship._id },
          { status: 'following', respondedAt: null }
        );
      }
      return res.status(200).json({
        success: true,
        message: 'Unfollowed successfully'
      });
    }

    // Regular one-way follow
    const follow = await FriendRequest.findOne({
      fromUser: currentUserId,
      toUser: targetUserId,
      status: 'following'
    });

    if (!follow) {
      // Idempotent: already not following - return 200 so client can refetch state
      return res.status(200).json({
        success: true,
        message: 'Already not following',
        alreadyUnfollowed: true
      });
    }

    await FriendRequest.deleteOne({ _id: follow._id });

    res.status(200).json({
      success: true,
      message: 'Unfollowed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unfollow',
      error: error.message
    });
  }
};

// Get followers (users who follow the current user)
// Includes both one-way followers and mutual follows (friends)
export const getFollowers = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = '' } = req.query;

    // Get one-way followers
    const oneWayFollowers = await FriendRequest.find({
      toUser: userId,
      status: 'following'
    })
      .select('fromUser createdAt')
      .populate('fromUser', 'name email profileImage accountType onlineStatus lastSeen subscription')
      .sort({ createdAt: -1 })
      .lean();

    // Get mutual follows (friends) where they follow you
    const mutualFollowers = await FriendRequest.find({
      toUser: userId,
      status: 'accepted'
    })
      .select('fromUser createdAt')
      .populate('fromUser', 'name email profileImage accountType onlineStatus lastSeen subscription')
      .sort({ createdAt: -1 })
      .lean();

    // Combine and format
    let allFollowers = [...oneWayFollowers, ...mutualFollowers].map(f => ({
      _id: f.fromUser._id,
      name: f.fromUser.name,
      email: f.fromUser.email,
      profileImage: f.fromUser.profileImage,
      accountType: f.fromUser.accountType,
      onlineStatus: f.fromUser.onlineStatus,
      lastSeen: f.fromUser.lastSeen,
      subscription: f.fromUser.subscription || {
        badgeType: null,
        subscriptionId: null
      },
      followedAt: f.createdAt,
      isFriend: f.status === 'accepted'
    }));

    // Filter by search if provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      allFollowers = allFollowers.filter(f => 
        f.name.toLowerCase().includes(searchLower) ||
        f.email.toLowerCase().includes(searchLower)
      );
    }

    res.status(200).json({
      success: true,
      data: allFollowers,
      count: allFollowers.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch followers',
      error: error.message
    });
  }
};

// Get following (users the current user follows)
// Includes both one-way following and mutual follows (friends)
export const getFollowing = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search = '' } = req.query;

    // Get one-way following
    const oneWayFollowing = await FriendRequest.find({
      fromUser: userId,
      status: 'following'
    })
      .select('toUser createdAt')
      .populate('toUser', 'name email profileImage accountType onlineStatus lastSeen subscription')
      .sort({ createdAt: -1 })
      .lean();

    // Get mutual follows (friends) where you follow them
    const mutualFollowing = await FriendRequest.find({
      fromUser: userId,
      status: 'accepted'
    })
      .select('toUser createdAt')
      .populate('toUser', 'name email profileImage accountType onlineStatus lastSeen subscription')
      .sort({ createdAt: -1 })
      .lean();

    // Combine and format
    let allFollowing = [...oneWayFollowing, ...mutualFollowing].map(f => ({
      _id: f.toUser._id,
      name: f.toUser.name,
      email: f.toUser.email,
      profileImage: f.toUser.profileImage,
      accountType: f.toUser.accountType,
      onlineStatus: f.toUser.onlineStatus,
      lastSeen: f.toUser.lastSeen,
      subscription: f.toUser.subscription || {
        badgeType: null,
        subscriptionId: null
      },
      followedAt: f.createdAt,
      isFriend: f.status === 'accepted'
    }));

    // Filter by search if provided
    if (search && search.trim()) {
      const searchLower = search.toLowerCase().trim();
      allFollowing = allFollowing.filter(f => 
        f.name.toLowerCase().includes(searchLower) ||
        f.email.toLowerCase().includes(searchLower)
      );
    }

    res.status(200).json({
      success: true,
      data: allFollowing,
      count: allFollowing.length
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch following',
      error: error.message
    });
  }
};

// Get user's followers/following counts (Instagram-style)
// Friends = mutual follows (both status 'accepted')
// Followers = one-way followers + mutual follows
// Following = one-way following + mutual follows
export const getFollowStats = async (req, res) => {
  try {
    const userId = req.user._id;

    const [oneWayFollowers, mutualFollowers, oneWayFollowing, mutualFollowing, friendsCount] = await Promise.all([
      FriendRequest.countDocuments({ toUser: userId, status: 'following' }),
      FriendRequest.countDocuments({ toUser: userId, status: 'accepted' }),
      FriendRequest.countDocuments({ fromUser: userId, status: 'following' }),
      FriendRequest.countDocuments({ fromUser: userId, status: 'accepted' }),
      FriendRequest.countDocuments({
        $or: [
          { fromUser: userId, status: 'accepted' },
          { toUser: userId, status: 'accepted' }
        ]
      })
    ]);

    // Instagram logic: Friends are mutual follows (counted in both followers and following)
    const followers = oneWayFollowers + mutualFollowers;
    const following = oneWayFollowing + mutualFollowing;
    // Since mutual follows create 2 records (one each direction), divide by 2
    const friends = Math.floor(friendsCount / 2);

    res.status(200).json({
      success: true,
      data: {
        followers,
        following,
        friends
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to fetch follow stats',
      error: error.message
    });
  }
};

// Unfriend (remove friendship)
export const unfriend = async (req, res) => {
  try {
    const { friendId } = req.params;
    const userId = req.user._id;

    const friendship = await FriendRequest.findOne({
      $or: [
        { fromUser: userId, toUser: friendId, status: 'accepted' },
        { fromUser: friendId, toUser: userId, status: 'accepted' }
      ]
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found'
      });
    }

    await FriendRequest.deleteOne({ _id: friendship._id });

    res.status(200).json({
      success: true,
      message: 'Unfriended successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Failed to unfriend',
      error: error.message
    });
  }
};

