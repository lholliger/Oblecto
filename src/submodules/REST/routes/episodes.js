import sequelize from 'sequelize';
import path from 'path';
import fs from 'fs';
import errors from 'restify-errors';
import jimp from 'jimp';


import databases from '../../../submodules/database';
import authMiddleWare from '../middleware/auth';

const Op = sequelize.Op;

export default (server, oblecto) => {
    // Endpoint to get a list of episodes from all series
    server.get('/episodes/list/:sorting', authMiddleWare.requiresAuth, async function (req, res, next) {
        let limit = 20;
        let page = 0;

        let AllowedOrders = ['desc', 'asc'];

        if (AllowedOrders.indexOf(req.params.order.toLowerCase()) === -1)
            return next(new errors.BadRequestError('Sorting order is invalid'));

        if (!(req.params.sorting in databases.episode.rawAttributes))
            return next(new errors.BadRequestError('Sorting method is invalid'));

        if (req.params.count && Number.isInteger(req.params.count))
            limit = parseInt(req.params.count);

        if (req.params.page && Number.isInteger(req.params.page))
            page = parseInt(req.params.page);

        let results = await databases.episode.findAll({
            include: [
                databases.tvshow,
                {
                    model: databases.trackEpisodes,
                    required: false,
                    where: {
                        userId: req.authorization.user.id
                    }
                }
            ],
            order: [
                [req.params.sorting, req.params.order]
            ],
            limit,
            offset: limit * page
        });

        res.send(results);
    });

    // Endpoint to get a banner image for an episode based on the local episode ID
    server.get('/episode/:id/banner', async function (req, res, next) {
        // Get episode data
        let episode = await databases.episode.findByPk(req.params.id, {
            include: [databases.file]
        });

        let thumbnailPath = oblecto.artworkUtils.episodeBannerPath(episode, 'medium');

        // Check if the thumbnail exists
        fs.stat(thumbnailPath, function (err) {
            if (err)
                return next(new errors.NotFoundError('No banner found'));

            // If the thumbnail exists, simply pipe that to the client
            fs.createReadStream(thumbnailPath).pipe(res);

        });

    });

    server.put('/episode/:id/banner', async function (req, res, next) {
        let episode = await databases.episode.findByPk(req.params.id, {
            include: [databases.file]
        });

        if (!episode) {
            return next(new errors.NotFoundError('Episode does not exist'));
        }

        let thumbnailPath = this.oblecto.artworkUtils.episodeBannerPath(episode);

        if (req.files.length < 1) {
            return next(new errors.MissingParameter('Image file is missing'));
        }

        let uploadPath = req.files[Object.keys(req.files)[0]].path;

        try {
            let image = await jimp.read(uploadPath);

            let ratio = image.bitmap.width / image.bitmap.height;

            if ( !(1 <= ratio <= 2)) {
                return next(new errors.InvalidContent('Image aspect ratio is incorrect'));
            }

        } catch (e) {
            return next(new errors.InvalidContent('File is not an image'));
        }

        try {
            fs.copyFile(uploadPath, thumbnailPath, (err) => {
                if (err) throw err;

                for (let size of Object.keys(this.oblecto.config.artwork.poster)) {
                    this.oblecto.queue.pushJob('rescaleImage', {
                        from: this.oblecto.artworkUtils.episodeBannerPath(episode),
                        to: this.oblecto.artworkUtils.episodeBannerPath(episode, size),
                        width: this.oblecto.config.artwork.poster[size]
                    });
                }

                res.send(['success']);
            });
        } catch (e) {
            console.log(e);

            return next(new errors.Internal('An error has occured during upload of banner'));
        }

        next();
    });

    // Endpoint to list all stored files for the specific episode
    server.get('/episode/:id/files', authMiddleWare.requiresAuth, async function (req, res) {
        let episode = await databases.episode.findByPk(req.params.id, {
            include: [databases.file]
        });

        res.send(episode.files);
    });


    // Endpoint to send episode video file to the client
    // TODO: move this to the file route and use file id to play, abstracting this from episodes
    server.get('/episode/:id/play', async function (req, res, next) {
        // search for attributes
        let episode = await databases.episode.findByPk(req.params.id, {
            include: [databases.file]
        });

        let file = episode.files[0];

        res.redirect(`/stream/${file.id}`, next);

    });

    // Endpoint to retrieve episode details based on the local episode ID
    server.get('/episode/:id/info', authMiddleWare.requiresAuth, async function (req, res) {
        // search for attributes
        let episode = await databases.episode.findByPk(req.params.id, {
            include: [
                databases.file,
                databases.tvshow,
                {
                    model: databases.trackEpisodes,
                    required: false,
                    where: {
                        userId: req.authorization.user.id
                    }
                }
            ]
        });

        res.send(episode);

    });

    // Endpoint to retrieve the episode next in series based on the local episode ID
    server.get('/episode/:id/next', authMiddleWare.requiresAuth, async function (req, res) {
        // search for attributes
        let results = await databases.episode.findByPk(req.params.id);
        let episode = await databases.episode.findOne({
            where: {
                tvshowId: results.tvshowId,
                [Op.or]: [{
                    [Op.and]: [{
                        airedEpisodeNumber: {
                            [Op.gt]: results.airedEpisodeNumber
                        }
                    },
                    {
                        airedSeason: {
                            [Op.gte]: results.airedSeason
                        }
                    },
                    ]
                },
                {
                    [Op.and]: [{
                        airedSeason: {
                            [Op.gt]: results.airedSeason
                        }
                    }, ]
                }
                ]
            },
            order: [
                ['airedSeason', 'ASC'],
                ['airedEpisodeNumber', 'ASC'],
            ]
        });

        res.send(episode);

    });

    server.get('/episodes/search/:name', authMiddleWare.requiresAuth, async function (req, res) {
        // search for attributes
        let episode = await databases.episode.findAll({
            where: {
                episodeName: {
                    [Op.like]: '%' + req.params.name + '%'
                }
            },
            include: [
                databases.file,
                databases.tvshow,
                {
                    model: databases.trackEpisodes,
                    required: false,
                    where: {
                        userId: req.authorization.user.id
                    }
                }
            ]
        });

        res.send(episode);

    });

    // Endpoint to get the episodes currently being watched
    server.get('/episodes/watching', authMiddleWare.requiresAuth, async function (req, res) {
        // search for attributes
        let watching = await databases.episode.findAll({
            include: [
                databases.tvshow,
                {
                    model: databases.trackEpisodes,
                    required: true,
                    where: {
                        userId: req.authorization.user.id,
                        progress: {
                            [sequelize.Op.lt]: 0.9
                        },
                        updatedAt: {
                            [sequelize.Op.gt]: new Date() - (1000*60*60*24*7)
                        }
                    },
                }],
            order: [
                ['updatedAt', 'DESC'],
            ],
        });

        // We are only interested in the episode objects, so extract all the episode object from
        // each track object and send the final mapped array to the client
        res.send(watching);
    });

    server.get('/episodes/next', authMiddleWare.requiresAuth, async function (req, res, next) {
        // Next episodes currently doesn't work on sqlite as the LPAD function doesn't exist
        // Todo: Fix next episodes endpoint to support sqlite
        if (oblecto.config.database.dialect === 'sqlite')
            return next(new errors.NotImplementedError('Next episode is not supported when using sqlite (yet)'));

        // search for attributes
        let latestWatched = await databases.episode.findAll({
            attributes: {
                include: [
                    [sequelize.fn('MAX', sequelize.col('absoluteNumber')), 'absoluteNumber'],
                    [sequelize.fn('MAX', sequelize.fn('concat', sequelize.fn('LPAD', sequelize.col('airedSeason'), 2, '0'), sequelize.fn('LPAD', sequelize.col('airedEpisodeNumber'), 2, '0'))), 'seasonepisode'],
                    [sequelize.fn('MAX', sequelize.col('firstAired')), 'firstAired']
                ]
            },
            include: [{
                model: databases.trackEpisodes,
                required: true,
                where: {
                    userId: req.authorization.user.id,
                    progress: {
                        [sequelize.Op.gt]: 0.9
                    },
                    updatedAt: {
                        [sequelize.Op.gt]: new Date() - (1000*60*60*24*7)
                    }
                },
            }],
            group: [
                'tvshowId'
            ]
        });

        let nextUp = [];

        for (let latest of latestWatched) {
            latest = latest.toJSON();
            let next = await databases.episode.findOne({
                attributes: {
                    include: [
                        [sequelize.fn('concat', sequelize.fn('LPAD', sequelize.col('airedSeason'), 2, '0'), sequelize.fn('LPAD', sequelize.col('airedEpisodeNumber'), 2, '0')), 'seasonepisode']
                    ]
                },
                include: [
                    databases.tvshow,
                    {
                        model: databases.trackEpisodes,
                        where: {
                            userId: req.authorization.user.id
                        },
                    }],
                where: sequelize.and(
                    sequelize.where(sequelize.col('tvshowId'), '=', latest.tvshowId),
                    sequelize.where(sequelize.fn('concat', sequelize.fn('LPAD', sequelize.col('airedSeason'), 2, '0'), sequelize.fn('LPAD', sequelize.col('airedEpisodeNumber'), 2, '0')), '>', latest.seasonepisode),
                ),
                order: [
                    sequelize.col('seasonepisode')
                ]
            });

            if (next) {
                nextUp.push(next);
            }
        }

        res.send(nextUp);

    });


};
