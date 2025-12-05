class FileOperationQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.totalEnqueued = 0;
    this.totalCompleted = 0;
  }
  
  async enqueue(operation) {
    this.totalEnqueued++;
    return new Promise((resolve, reject) => {
      this.queue.push({ operation, resolve, reject });
      this.process();
    });
  }
  
  async process() {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;
    
    while (this.queue.length > 0) {
      const { operation, resolve, reject } = this.queue.shift();
      try {
        const result = await operation();
        this.totalCompleted++;
        resolve(result);
      } catch (error) {
        this.totalCompleted++;
        reject(error);
      }
    }
    
    this.processing = false;
  }
  
  getStats() {
    return {
      enqueued: this.totalEnqueued,
      completed: this.totalCompleted,
      pending: this.queue.length
    };
  }
}

// Export singleton instance
export const fileQueue = new FileOperationQueue();
