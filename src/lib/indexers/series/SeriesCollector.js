import recursive from 'recursive-readdir';
import path from 'path';

export default class SeriesCollector {
    /**
     *
     * @param {Oblecto} oblecto
     */
    constructor(oblecto) {
        this.oblecto = oblecto;
    }

    /**
     *
     * @param {String} directory - Which directory to add to the index queue
     * @param {Boolean} doReIndex
     * @returns {Promise<void>}
     */
    async collectDirectory(directory, doReIndex) {
        let files = await recursive(directory);

        files.forEach(file => {
            this.collectFile(file, doReIndex);
        });
    }

    /**
     *
     * @param {String} file - File path to add to the index queue
     * @param {Boolean} doReIndex
     * @returns {Promise<void>}
     */
    async collectFile(file, doReIndex) {
        console.log('Pushing file', file, 'to queue');
        let extension = path.parse(file).ext.toLowerCase();

        if (this.oblecto.config.fileExtensions.video.indexOf(extension) !== -1) {
            this.oblecto.queue.queueJob('indexEpisode',{path: file, doReIndex});
        }
    }

    /**
     *
     * @returns {Promise<void>}
     */
    async collectAll() {
        this.oblecto.config.tvshows.directories.forEach(directory => {
            this.collectDirectory(directory.path);
        });
    }
}
